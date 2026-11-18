/**
 * Biswas Tech – Audio Recording Studio
 * IndexedDB Database Persistence Module
 * 
 * Manages reliable offline client-side storage for sessions,
 * scripts, and uncompressed PCM WAV recording Blobs.
 */

(function (window) {
  'use strict';

  const DB_NAME = 'biswasTechAudioDB';
  const DB_VERSION = 1;

  class AudioStudioDatabase {
    constructor() {
      this.db = null;
      this.initPromise = null;
    }

    /**
     * Initializes IndexedDB database and requests persistent browser storage
     */
    async init() {
      if (this.db) return this.db;
      if (this.initPromise) return this.initPromise;

      this.initPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          reject(new Error('IndexedDB is not supported in this browser. Please use a modern browser.'));
          return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // 1. Sessions store
          if (!db.objectStoreNames.contains('sessions')) {
            const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
            sessionStore.createIndex('whatsappNumber', 'whatsappNumber', { unique: false });
            sessionStore.createIndex('createdAt', 'createdAt', { unique: false });
            sessionStore.createIndex('sessionStatus', 'sessionStatus', { unique: false });
          }

          // 2. Scripts store
          if (!db.objectStoreNames.contains('scripts')) {
            const scriptStore = db.createObjectStore('scripts', { keyPath: 'id' });
            scriptStore.createIndex('sessionId', 'sessionId', { unique: false });
            scriptStore.createIndex('scriptId', 'scriptId', { unique: false });
            scriptStore.createIndex('recordingStatus', 'recordingStatus', { unique: false });
          }

          // 3. Recordings store
          if (!db.objectStoreNames.contains('recordings')) {
            const recordingStore = db.createObjectStore('recordings', { keyPath: 'recordingId' });
            recordingStore.createIndex('sessionId', 'sessionId', { unique: false });
            recordingStore.createIndex('scriptId', 'scriptId', { unique: false });
          }
        };

        request.onsuccess = async (event) => {
          this.db = event.target.result;

          // Request persistent browser storage if available
          if (navigator.storage && navigator.storage.persist) {
            try {
              const isPersisted = await navigator.storage.persist();
              if (isPersisted) {
                console.log('Biswas Tech: Storage successfully marked as persistent.');
              }
            } catch (e) {
              console.warn('Storage persist request warning:', e);
            }
          }

          resolve(this.db);
        };

        request.onerror = (event) => {
          reject(new Error(`Failed to open IndexedDB '${DB_NAME}': ${event.target.error}`));
        };

        request.onblocked = () => {
          console.warn('IndexedDB database open blocked: another tab has an older version open.');
        };
      });

      return this.initPromise;
    }

    /**
     * Executes a transaction on the given stores
     */
    _getTransaction(storeNames, mode) {
      if (!this.db) {
        throw new Error('Database is not initialized. Call init() first.');
      }
      return this.db.transaction(storeNames, mode);
    }

    // ==========================================
    // SESSIONS
    // ==========================================

    async saveSession(session) {
      await this.init();
      return new Promise((resolve, reject) => {
        session.updatedAt = new Date().toISOString();
        const tx = this._getTransaction(['sessions'], 'readwrite');
        const store = tx.objectStore('sessions');
        const request = store.put(session);

        request.onsuccess = () => resolve(session);
        request.onerror = (e) => reject(new Error(`Error saving session: ${e.target.error}`));
      });
    }

    async getSession(sessionId) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this._getTransaction(['sessions'], 'readonly');
        const store = tx.objectStore('sessions');
        const request = store.get(sessionId);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject(new Error(`Error getting session: ${e.target.error}`));
      });
    }

    async getAllSessions() {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this._getTransaction(['sessions'], 'readonly');
        const store = tx.objectStore('sessions');
        const request = store.getAll();

        request.onsuccess = () => {
          const sessions = request.result || [];
          // Sort by updatedAt descending
          sessions.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
          resolve(sessions);
        };
        request.onerror = (e) => reject(new Error(`Error listing sessions: ${e.target.error}`));
      });
    }

    async getUnfinishedSessionForNumber(whatsappNumber) {
      await this.init();
      const allSessions = await this.getAllSessions();
      // Find the most recent active/unfinished session for this exact WhatsApp number
      return allSessions.find(s =>
        s.whatsappNumber === whatsappNumber &&
        s.sessionStatus === 'active' &&
        s.completedScripts < s.totalScripts
      ) || null;
    }

    // ==========================================
    // SCRIPTS
    // ==========================================

    async saveScripts(sessionId, scripts) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this._getTransaction(['scripts'], 'readwrite');
        const store = tx.objectStore('scripts');

        for (const script of scripts) {
          const scriptRecord = {
            id: `${sessionId}__${script.scriptId}`,
            scriptId: script.scriptId,
            sessionId: sessionId,
            scriptText: script.scriptText,
            scriptIndex: script.scriptIndex,
            recordingStatus: script.recordingStatus || 'pending',
            recordingTimestamp: script.recordingTimestamp || null
          };
          store.put(scriptRecord);
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(new Error(`Error saving scripts: ${e.target.error}`));
      });
    }

    async getScriptsForSession(sessionId) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this._getTransaction(['scripts'], 'readonly');
        const store = tx.objectStore('scripts');
        const index = store.index('sessionId');
        const request = index.getAll(sessionId);

        request.onsuccess = () => {
          const list = request.result || [];
          // Sort by original scriptIndex
          list.sort((a, b) => a.scriptIndex - b.scriptIndex);
          resolve(list);
        };
        request.onerror = (e) => reject(new Error(`Error retrieving scripts: ${e.target.error}`));
      });
    }

    async updateScriptStatus(sessionId, scriptId, recordingStatus, recordingTimestamp = null) {
      await this.init();
      return new Promise((resolve, reject) => {
        const id = `${sessionId}__${scriptId}`;
        const tx = this._getTransaction(['scripts'], 'readwrite');
        const store = tx.objectStore('scripts');
        const getReq = store.get(id);

        getReq.onsuccess = () => {
          if (!getReq.result) {
            reject(new Error(`Script ${scriptId} not found in session ${sessionId}`));
            return;
          }
          const record = getReq.result;
          record.recordingStatus = recordingStatus;
          record.recordingTimestamp = recordingTimestamp || (recordingStatus === 'completed' ? new Date().toISOString() : null);
          const putReq = store.put(record);
          putReq.onsuccess = () => resolve(record);
          putReq.onerror = (e) => reject(e.target.error);
        };

        getReq.onerror = (e) => reject(e.target.error);
      });
    }

    // ==========================================
    // RECORDINGS
    // ==========================================

    async saveRecording(recording) {
      await this.init();
      return new Promise((resolve, reject) => {
        const recordingRecord = {
          recordingId: `${recording.sessionId}__${recording.scriptId}`,
          sessionId: recording.sessionId,
          scriptId: recording.scriptId,
          wavBlob: recording.wavBlob,
          duration: recording.duration,
          sampleRate: recording.sampleRate || 48000,
          channels: recording.channels || 1,
          bitDepth: recording.bitDepth || 16,
          createdAt: recording.createdAt || new Date().toISOString(),
          fileSize: recording.fileSize || (recording.wavBlob ? recording.wavBlob.size : 0)
        };

        const tx = this._getTransaction(['recordings'], 'readwrite');
        const store = tx.objectStore('recordings');
        const request = store.put(recordingRecord);

        request.onsuccess = () => resolve(recordingRecord);
        request.onerror = (e) => reject(new Error(`Error saving recording: ${e.target.error}`));
      });
    }

    async getRecording(sessionId, scriptId) {
      await this.init();
      return new Promise((resolve, reject) => {
        const recordingId = `${sessionId}__${scriptId}`;
        const tx = this._getTransaction(['recordings'], 'readonly');
        const store = tx.objectStore('recordings');
        const request = store.get(recordingId);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject(new Error(`Error retrieving recording: ${e.target.error}`));
      });
    }

    async getAllRecordingsForSession(sessionId) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this._getTransaction(['recordings'], 'readonly');
        const store = tx.objectStore('recordings');
        const index = store.index('sessionId');
        const request = index.getAll(sessionId);

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e) => reject(new Error(`Error retrieving session recordings: ${e.target.error}`));
      });
    }

    async deleteRecording(sessionId, scriptId) {
      await this.init();
      return new Promise((resolve, reject) => {
        const recordingId = `${sessionId}__${scriptId}`;
        const tx = this._getTransaction(['recordings', 'scripts'], 'readwrite');
        
        // Delete from recordings
        const recStore = tx.objectStore('recordings');
        recStore.delete(recordingId);

        // Reset script status to pending
        const scriptStore = tx.objectStore('scripts');
        const getScript = scriptStore.get(recordingId);
        getScript.onsuccess = () => {
          if (getScript.result) {
            const sc = getScript.result;
            sc.recordingStatus = 'pending';
            sc.recordingTimestamp = null;
            scriptStore.put(sc);
          }
        };

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(new Error(`Error deleting recording: ${e.target.error}`));
      });
    }

    async deleteSession(sessionId) {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this._getTransaction(['sessions', 'scripts', 'recordings'], 'readwrite');

        // Delete session
        tx.objectStore('sessions').delete(sessionId);

        // Delete scripts
        const scriptStore = tx.objectStore('scripts');
        const scriptIndex = scriptStore.index('sessionId');
        const scriptReq = scriptIndex.getAllKeys(sessionId);
        scriptReq.onsuccess = () => {
          const keys = scriptReq.result || [];
          for (const key of keys) {
            scriptStore.delete(key);
          }
        };

        // Delete recordings
        const recStore = tx.objectStore('recordings');
        const recIndex = recStore.index('sessionId');
        const recReq = recIndex.getAllKeys(sessionId);
        recReq.onsuccess = () => {
          const keys = recReq.result || [];
          for (const key of keys) {
            recStore.delete(key);
          }
        };

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(new Error(`Error deleting session: ${e.target.error}`));
      });
    }

    async clearAllData() {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this._getTransaction(['sessions', 'scripts', 'recordings'], 'readwrite');
        tx.objectStore('sessions').clear();
        tx.objectStore('scripts').clear();
        tx.objectStore('recordings').clear();

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(new Error(`Error clearing all data: ${e.target.error}`));
      });
    }

    /**
     * Calculates storage quota usage and saved audio statistics
     */
    async getStorageUsage() {
      await this.init();
      let quota = 0;
      let usage = 0;

      if (navigator.storage && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          quota = estimate.quota || 0;
          usage = estimate.usage || 0;
        } catch (e) {
          console.warn('Storage estimate failed:', e);
        }
      }

      // Count sessions and calculate total recording size
      const sessions = await this.getAllSessions();
      let totalAudioBytes = 0;
      let totalRecordingsCount = 0;

      const tx = this._getTransaction(['recordings'], 'readonly');
      const store = tx.objectStore('recordings');
      const allRecordings = await new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      for (const rec of allRecordings) {
        totalRecordingsCount++;
        totalAudioBytes += rec.fileSize || (rec.wavBlob ? rec.wavBlob.size : 0);
      }

      return {
        quotaBytes: quota,
        usageBytes: usage,
        totalSessions: sessions.length,
        totalRecordings: totalRecordingsCount,
        totalAudioBytes
      };
    }
  }

  window.AudioStudioDB = new AudioStudioDatabase();

})(window);

