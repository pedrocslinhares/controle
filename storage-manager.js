/**
 * Sistema de Armazenamento Avançado para PWA
 * Utiliza IndexedDB com fallback para localStorage
 * Suporta até 500MB de dados
 */

class StorageManager {
  constructor() {
    this.dbName = 'ColetasDB';
    this.dbVersion = 1;
    this.storeName = 'collections';
    this.db = null;
    this.isIndexedDBAvailable = false;
    this.initPromise = this.init();
  }

  async init() {
    try {
      // Verificar se IndexedDB está disponível
      if (!window.indexedDB) {
        console.warn('IndexedDB não disponível, usando localStorage');
        return;
      }

      // Abrir banco de dados
      this.db = await this.openDatabase();
      this.isIndexedDBAvailable = true;
      
      // Migrar dados do localStorage se existirem
      await this.migrateFromLocalStorage();
      
      console.log('StorageManager inicializado com IndexedDB');
    } catch (error) {
      console.error('Erro ao inicializar IndexedDB:', error);
      console.log('Usando localStorage como fallback');
    }
  }

  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Criar object store se não existir
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async migrateFromLocalStorage() {
    try {
      const collections = localStorage.getItem('allEquipmentCollections');
      if (collections) {
        await this.setItem('allEquipmentCollections', JSON.parse(collections));
        console.log('Dados migrados do localStorage para IndexedDB');
        // Manter localStorage como backup por enquanto
      }
    } catch (error) {
      console.error('Erro na migração:', error);
    }
  }

  async setItem(key, value) {
    await this.initPromise;

    if (this.isIndexedDBAvailable) {
      return this.setItemIndexedDB(key, value);
    } else {
      return this.setItemLocalStorage(key, value);
    }
  }

  async getItem(key) {
    await this.initPromise;

    if (this.isIndexedDBAvailable) {
      return this.getItemIndexedDB(key);
    } else {
      return this.getItemLocalStorage(key);
    }
  }

  async removeItem(key) {
    await this.initPromise;

    if (this.isIndexedDBAvailable) {
      return this.removeItemIndexedDB(key);
    } else {
      return this.removeItemLocalStorage(key);
    }
  }

  async clear() {
    await this.initPromise;

    if (this.isIndexedDBAvailable) {
      return this.clearIndexedDB();
    } else {
      return this.clearLocalStorage();
    }
  }

  // Métodos IndexedDB
  setItemIndexedDB(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const data = {
        key: key,
        value: value,
        timestamp: Date.now()
      };

      const request = store.put(data);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  getItemIndexedDB(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  removeItemIndexedDB(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  clearIndexedDB() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Métodos localStorage (fallback)
  setItemLocalStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  getItemLocalStorage(key) {
    try {
      const item = localStorage.getItem(key);
      return Promise.resolve(item ? JSON.parse(item) : null);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  removeItemLocalStorage(key) {
    try {
      localStorage.removeItem(key);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  clearLocalStorage() {
    try {
      localStorage.clear();
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // Métodos utilitários
  async getStorageInfo() {
    let info = {
      type: this.isIndexedDBAvailable ? 'IndexedDB' : 'localStorage',
      quota: 0,
      usage: 0,
      available: 0
    };

    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        info.quota = estimate.quota || 0;
        info.usage = estimate.usage || 0;
        info.available = info.quota - info.usage;
      }
    } catch (error) {
      console.warn('Não foi possível obter informações de quota:', error);
    }

    return info;
  }

  async exportData() {
    await this.initPromise;
    
    const data = {};
    
    if (this.isIndexedDBAvailable) {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        
        request.onsuccess = () => {
          const result = request.result;
          result.forEach(item => {
            data[item.key] = item.value;
          });
          resolve(data);
        };
        
        request.onerror = () => reject(request.error);
      });
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = JSON.parse(localStorage.getItem(key));
      }
      return Promise.resolve(data);
    }
  }

  async importData(data) {
    await this.initPromise;
    
    for (const [key, value] of Object.entries(data)) {
      await this.setItem(key, value);
    }
  }
}

// Instância global do StorageManager
const storageManager = new StorageManager();

// Wrapper para manter compatibilidade com localStorage
const enhancedStorage = {
  setItem: async (key, value) => {
    const parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
    return storageManager.setItem(key, parsedValue);
  },
  
  getItem: async (key) => {
    const value = await storageManager.getItem(key);
    return value ? JSON.stringify(value) : null;
  },
  
  removeItem: (key) => storageManager.removeItem(key),
  clear: () => storageManager.clear(),
  
  // Métodos adicionais
  getStorageInfo: () => storageManager.getStorageInfo(),
  exportData: () => storageManager.exportData(),
  importData: (data) => storageManager.importData(data)
};

// Disponibilizar globalmente
window.enhancedStorage = enhancedStorage;
window.storageManager = storageManager;