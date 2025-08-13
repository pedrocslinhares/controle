/**
 * Sistema PWA de Controle de Coletas de Equipamentos
 * Versão completa com todas as funcionalidades originais + PWA features
 */

// =============================================================================
// ENHANCED STORAGE MANAGER
// =============================================================================

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
            if (!window.indexedDB) {
                console.warn('IndexedDB não disponível, usando localStorage');
                return;
            }

            this.db = await this.openDatabase();
            this.isIndexedDBAvailable = true;
            await this.migrateFromLocalStorage();
            console.log('StorageManager inicializado com IndexedDB - Capacidade: 500MB+');
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

    setItemIndexedDB(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const data = { key: key, value: value, timestamp: Date.now() };
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
}

// =============================================================================
// PWA FEATURES
// =============================================================================

class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this.init();
    }

    init() {
        this.registerServiceWorker();
        this.setupInstallPrompt();
        this.setupConnectionStatus();
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js')
                    .then(registration => {
                        console.log('Service Worker registrado:', registration);
                    })
                    .catch(error => {
                        console.log('Erro no Service Worker:', error);
                    });
            });
        }
    }

    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPrompt();
        });

        const installButton = document.getElementById('installButton');
        const dismissInstall = document.getElementById('dismissInstall');

        if (installButton) {
            installButton.addEventListener('click', () => this.installApp());
        }

        if (dismissInstall) {
            dismissInstall.addEventListener('click', () => this.hideInstallPrompt());
        }
    }

    showInstallPrompt() {
        const installPrompt = document.getElementById('installPrompt');
        if (installPrompt) {
            installPrompt.classList.add('show');
        }
    }

    hideInstallPrompt() {
        const installPrompt = document.getElementById('installPrompt');
        if (installPrompt) {
            installPrompt.classList.remove('show');
        }
    }

    async installApp() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                this.hideInstallPrompt();
            }
            this.deferredPrompt = null;
        }
    }

    setupConnectionStatus() {
        const updateStatus = () => {
            const status = document.getElementById('connectionStatus');
            const pwaStatus = document.getElementById('pwaStatus');
            
            if (status && pwaStatus) {
                if (navigator.onLine) {
                    status.textContent = '🟢 Online';
                    pwaStatus.className = 'pwa-status online';
                } else {
                    status.textContent = '🔴 Offline';
                    pwaStatus.className = 'pwa-status offline';
                }
                pwaStatus.style.display = 'block';
                setTimeout(() => {
                    pwaStatus.style.display = 'none';
                }, 3000);
            }
        };

        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        
        // Status inicial
        updateStatus();
    }
}

// =============================================================================
// SISTEMA PRINCIPAL DE COLETAS
// =============================================================================

class ColetasApp {
    constructor() {
        this.storageManager = new StorageManager();
        this.pwaManager = new PWAManager();
        
        // Estado da aplicação
        this.allCollections = {};
        this.currentCollectionName = null;
        this.currentCollectionData = [];
        this.editingIndex = -1;
        
        // Elementos DOM
        this.initDOMElements();
        this.setupEventListeners();
    }

    initDOMElements() {
        // Telas principais
        this.mainScreen = document.getElementById('mainScreen');
        this.collectionsView = document.getElementById('collectionsView');
        this.collectionDataView = document.getElementById('collectionDataView');
        
        // Botões principais
        this.createNewCollectionBtn = document.getElementById('createNewCollectionBtn');
        this.accessCollectionBtn = document.getElementById('accessCollectionBtn');
        this.backToMainBtn = document.getElementById('backToMainBtn');
        this.backToCollectionsBtn = document.getElementById('backToCollectionsBtn');
        this.homeButton = document.getElementById('homeButton');
        
        // Elementos da coleta
        this.currentCollectionTitle = document.getElementById('currentCollectionTitle');
        this.collectionsList = document.getElementById('collectionsList');
        
        // Abas
        this.showFormBtn = document.getElementById('showFormBtn');
        this.showTableBtn = document.getElementById('showTableBtn');
        this.formView = document.getElementById('formView');
        this.tableView = document.getElementById('tableView');
        
        // Formulário
        this.dataEntryForm = document.getElementById('dataEntryForm');
        this.addUpdateBtn = document.getElementById('addUpdateBtn');
        this.clearFormBtn = document.getElementById('clearFormBtn');
        
        // Campos do formulário
        this.typeInput = document.getElementById('type');
        this.brandInput = document.getElementById('brand');
        this.modelInput = document.getElementById('model');
        this.serialNumberInput = document.getElementById('serialNumber');
        this.patSiadsInput = document.getElementById('patSiads');
        this.patEbserhInput = document.getElementById('patEbserh');
        this.patFubInput = document.getElementById('patFub');
        this.buildingInput = document.getElementById('building');
        this.floorInput = document.getElementById('floor');
        this.sectorInput = document.getElementById('sector');
        this.userInput = document.getElementById('user');
        this.observationInput = document.getElementById('observation');
        
        // Tabela e CSV
        this.exchangeTableBody = document.getElementById('exchangeTableBody');
        this.exportCsvBtn = document.getElementById('exportCsvBtn');
        this.csvOutputContainer = document.getElementById('csvOutputContainer');
        this.csvOutput = document.getElementById('csvOutput');
        this.copyCsvBtn = document.getElementById('copyCsvBtn');
        this.downloadCsvBtn = document.getElementById('downloadCsvBtn');
        this.clearAllItemsBtn = document.getElementById('clearAllItemsBtn');
        
        // UI
        this.messageBox = document.getElementById('messageBox');
        this.recordCountSpan = document.getElementById('recordCount');
        
        // Modais
        this.nameCollectionModal = document.getElementById('nameCollectionModal');
        this.collectionNameInput = document.getElementById('collectionNameInput');
        this.modalMessage = document.getElementById('modalMessage');
        this.confirmNameBtn = document.getElementById('confirmNameBtn');
        this.cancelNameBtn = document.getElementById('cancelNameBtn');
        
        this.confirmModal = document.getElementById('confirmModal');
        this.confirmModalTitle = document.getElementById('confirmModalTitle');
        this.confirmModalMessage = document.getElementById('confirmModalMessage');
        this.confirmActionBtn = document.getElementById('confirmActionBtn');
        this.cancelActionBtn = document.getElementById('cancelActionBtn');
    }

    setupEventListeners() {
        // Navegação principal
        this.createNewCollectionBtn?.addEventListener('click', () => this.createNewCollection());
        this.accessCollectionBtn?.addEventListener('click', () => this.showCollectionsList());
        this.backToMainBtn?.addEventListener('click', () => this.showView('mainScreen'));
        this.backToCollectionsBtn?.addEventListener('click', () => this.showView('collectionsView'));
        this.homeButton?.addEventListener('click', () => this.showView('mainScreen'));
        
        // Abas
        this.showFormBtn?.addEventListener('click', () => this.showDataViewTab('form'));
        this.showTableBtn?.addEventListener('click', () => this.showDataViewTab('table'));
        
        // Formulário
        this.dataEntryForm?.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.clearFormBtn?.addEventListener('click', () => this.clearForm());
        
        // CSV
        this.exportCsvBtn?.addEventListener('click', () => this.exportCurrentCollection());
        this.copyCsvBtn?.addEventListener('click', () => this.copyCsvToClipboard());
        this.downloadCsvBtn?.addEventListener('click', () => this.downloadCsv());
        this.clearAllItemsBtn?.addEventListener('click', () => this.clearAllItems());
        
        // Modais
        this.setupModalListeners();
    }

    setupModalListeners() {
        // Modal de nome da coleta
        const modalCloseButtons = document.querySelectorAll('.close-button');
        modalCloseButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.nameCollectionModal.style.display = 'none';
                this.confirmModal.style.display = 'none';
            });
        });
        
        // Fechar modal clicando fora
        window.addEventListener('click', (event) => {
            if (event.target === this.nameCollectionModal) {
                this.nameCollectionModal.style.display = 'none';
            }
            if (event.target === this.confirmModal) {
                this.confirmModal.style.display = 'none';
            }
        });
    }

    // =============================================================================
    // GERENCIAMENTO DE VIEWS
    // =============================================================================

    showView(viewId) {
        const views = [this.mainScreen, this.collectionsView, this.collectionDataView];
        views.forEach(view => {
            if (view && view.id === viewId) {
                view.classList.remove('hidden');
            } else if (view) {
                view.classList.add('hidden');
            }
        });
        
        if (viewId === 'collectionDataView') {
            this.showDataViewTab('form');
        } else {
            this.currentCollectionName = null;
            this.currentCollectionData = [];
        }
    }

    showDataViewTab(tab) {
        if (tab === 'form') {
            this.formView?.classList.remove('hidden');
            this.tableView?.classList.add('hidden');
            this.showFormBtn?.classList.add('active');
            this.showTableBtn?.classList.remove('active');
        } else if (tab === 'table') {
            this.formView?.classList.add('hidden');
            this.tableView?.classList.remove('hidden');
            this.showFormBtn?.classList.remove('active');
            this.showTableBtn?.classList.add('active');
            this.renderTable();
        }
    }

    // =============================================================================
    // GERENCIAMENTO DE DADOS
    // =============================================================================

    async loadAllCollections() {
        try {
            const stored = await this.storageManager.getItem('allEquipmentCollections');
            this.allCollections = stored || {};
            this.renderCollectionsList();
        } catch (error) {
            console.error('Erro ao carregar coleções:', error);
            this.allCollections = {};
            this.renderCollectionsList();
        }
    }

    async saveAllCollections() {
        try {
            await this.storageManager.setItem('allEquipmentCollections', this.allCollections);
            this.renderCollectionsList();
        } catch (error) {
            console.error('Erro ao salvar coleções:', error);
            this.showMessage('Erro ao salvar dados', 'error');
        }
    }

    loadCurrentCollectionData() {
        if (this.currentCollectionName && this.allCollections[this.currentCollectionName]) {
            this.currentCollectionData = this.allCollections[this.currentCollectionName];
        } else {
            this.currentCollectionData = [];
        }
        this.updateRecordCount();
    }

    async saveCurrentCollectionData() {
        if (this.currentCollectionName) {
            this.allCollections[this.currentCollectionName] = this.currentCollectionData;
            await this.saveAllCollections();
        }
    }

    // =============================================================================
    // COLETAS
    // =============================================================================

    async createNewCollection() {
        try {
            const name = await this.showNameCollectionModal();
            if (name) {
                if (this.allCollections[name]) {
                    this.modalMessage.textContent = 'Já existe uma coleta com este nome. Por favor, escolha outro.';
                    this.nameCollectionModal.style.display = 'flex';
                    return;
                }
                this.allCollections[name] = [];
                await this.saveAllCollections();
                this.showMessage(`Coleta "${name}" criada com sucesso!`);
                this.accessExistingCollection(name);
            }
        } catch (error) {
            this.showMessage('Criação de coleta cancelada.', 'error');
        }
    }

    showCollectionsList() {
        this.renderCollectionsList();
        this.showView('collectionsView');
    }

    accessExistingCollection(collectionName) {
        this.currentCollectionName = collectionName;
        if (this.currentCollectionTitle) {
            this.currentCollectionTitle.textContent = `Coleta: ${this.currentCollectionName}`;
        }
        this.loadCurrentCollectionData();
        this.showView('collectionDataView');
        this.showDataViewTab('form');
    }

    renderCollectionsList() {
        if (!this.collectionsList) return;
        
        this.collectionsList.innerHTML = '';
        const collectionNames = Object.keys(this.allCollections);

        if (collectionNames.length === 0) {
            this.collectionsList.innerHTML = '<p class="text-center text-gray-500">Nenhuma coleta criada ainda.</p>';
            return;
        }

        collectionNames.forEach(name => {
            const collectionItem = document.createElement('div');
            collectionItem.classList.add('collection-item');
            collectionItem.innerHTML = `
                <span>${this.escapeHTML(name)}</span>
                <div class="collection-actions">
                    <button onclick="app.accessExistingCollection('${this.escapeHTML(name)}')" class="btn-primary text-sm px-2 py-1">Acessar</button>
                    <button onclick="app.exportCollection('${this.escapeHTML(name)}')" class="btn-success text-sm px-2 py-1">Exportar</button>
                    <button onclick="app.deleteCollection('${this.escapeHTML(name)}')" class="btn-danger text-sm px-2 py-1">Excluir</button>
                </div>
            `;
            this.collectionsList.appendChild(collectionItem);
        });
    }

    async deleteCollection(collectionName) {
        const confirmed = await this.showConfirmModal('Excluir Coleta', 
            `Tem certeza que deseja APAGAR a coleta "${collectionName}" e todos os seus itens? Esta ação é irreversível!`);
        if (confirmed) {
            delete this.allCollections[collectionName];
            await this.saveAllCollections();
            this.showMessage(`Coleta "${collectionName}" excluída com sucesso!`, 'error');
            this.renderCollectionsList();
        }
    }

    // =============================================================================
    // ITENS
    // =============================================================================

    async handleFormSubmit(event) {
        event.preventDefault();

        const newItem = {
            type: this.typeInput?.value.trim() || '',
            brand: this.brandInput?.value.trim() || '',
            model: this.modelInput?.value.trim() || '',
            serialNumber: this.serialNumberInput?.value.trim() || '',
            patSiads: this.patSiadsInput?.value.trim() || '',
            patEbserh: this.patEbserhInput?.value.trim() || '',
            patFub: this.patFubInput?.value.trim() || '',
            building: this.buildingInput?.value.trim() || '',
            floor: this.floorInput?.value.trim() || '',
            sector: this.sectorInput?.value.trim() || '',
            user: this.userInput?.value.trim() || '',
            observation: this.observationInput?.value.trim() || ''
        };

        // Validações
        const requiredFields = {
            'TIPO': newItem.type,
            'MARCA': newItem.brand,
            'PRÉDIO': newItem.building,
            'ANDAR': newItem.floor,
            'SETOR/SALA': newItem.sector
        };

        for (const fieldName in requiredFields) {
            if (requiredFields[fieldName] === '') {
                this.showMessage(`O campo "${fieldName}" é obrigatório.`, 'error');
                return;
            }
        }

        // Validação de números
        const patNumberFields = [
            { name: 'PAT. SIADS', value: newItem.patSiads },
            { name: 'PAT. EBSERH', value: newItem.patEbserh }
        ];

        for (const field of patNumberFields) {
            if (field.value !== '' && !/^\d*$/.test(field.value)) {
                this.showMessage(`O campo "${field.name}" deve conter apenas números.`, 'error');
                return;
            }
        }

        // Validação de inventário
        const inventarioFields = [newItem.serialNumber, newItem.patSiads, newItem.patEbserh, newItem.patFub];
        const isAnyInventarioFieldFilled = inventarioFields.some(field => field !== '');

        if (!isAnyInventarioFieldFilled) {
            this.showMessage('Pelo menos um dos campos do grupo INVENTÁRIO (NÚMERO DE SÉRIE, PAT. SIADS, PAT. EBSERH, PAT. FUB) deve ser preenchido.', 'error');
            return;
        }

        // Salvar item
        if (this.editingIndex === -1) {
            this.currentCollectionData.push(newItem);
            this.showMessage('Item adicionado com sucesso!');
        } else {
            this.currentCollectionData[this.editingIndex] = newItem;
            this.showMessage('Item atualizado com sucesso!');
            this.editingIndex = -1;
            if (this.addUpdateBtn) {
                this.addUpdateBtn.textContent = 'Adicionar Item';
            }
        }

        await this.saveCurrentCollectionData();
        this.renderTable();
        this.dataEntryForm?.reset();
        this.showDataViewTab('form');
    }

    editItem(index) {
        const itemToEdit = this.currentCollectionData[index];
        if (!itemToEdit) return;

        // Preencher formulário
        if (this.typeInput) this.typeInput.value = itemToEdit.type || '';
        if (this.brandInput) this.brandInput.value = itemToEdit.brand || '';
        if (this.modelInput) this.modelInput.value = itemToEdit.model || '';
        if (this.serialNumberInput) this.serialNumberInput.value = itemToEdit.serialNumber || '';
        if (this.patSiadsInput) this.patSiadsInput.value = itemToEdit.patSiads || '';
        if (this.patEbserhInput) this.patEbserhInput.value = itemToEdit.patEbserh || '';
        if (this.patFubInput) this.patFubInput.value = itemToEdit.patFub || '';
        if (this.buildingInput) this.buildingInput.value = itemToEdit.building || '';
        if (this.floorInput) this.floorInput.value = itemToEdit.floor || '';
        if (this.sectorInput) this.sectorInput.value = itemToEdit.sector || '';
        if (this.userInput) this.userInput.value = itemToEdit.user || '';
        if (this.observationInput) this.observationInput.value = itemToEdit.observation || '';

        this.editingIndex = index;
        if (this.addUpdateBtn) {
            this.addUpdateBtn.textContent = 'Atualizar Item';
        }
        this.showMessage('Editando item. Altere os campos e clique em "Atualizar Item".');
        this.showDataViewTab('form');
    }

    async deleteItem(index) {
        const confirmed = await this.showConfirmModal('Excluir Item', 'Tem certeza que deseja excluir este item?');
        if (confirmed) {
            this.currentCollectionData.splice(index, 1);
            await this.saveCurrentCollectionData();
            this.renderTable();
            this.showMessage('Item excluído com sucesso!', 'error');
        }
    }

    clearForm() {
        this.dataEntryForm?.reset();
        this.editingIndex = -1;
        if (this.addUpdateBtn) {
            this.addUpdateBtn.textContent = 'Adicionar Item';
        }
        this.showMessage('Formulário limpo.');
    }

    async clearAllItems() {
        const confirmed = await this.showConfirmModal('Limpar Coleta', 
            `ATENÇÃO: Tem certeza que deseja APAGAR TODOS os itens da coleta "${this.currentCollectionName}"? Esta ação é irreversível!`);
        if (confirmed) {
            this.currentCollectionData = [];
            await this.saveCurrentCollectionData();
            this.renderTable();
            this.showMessage(`Todos os itens da coleta "${this.currentCollectionName}" foram apagados.`, 'error');
            this.showDataViewTab('form');
        }
    }

    // =============================================================================
    // TABELA
    // =============================================================================

    renderTable() {
        if (!this.exchangeTableBody) return;
        
        this.exchangeTableBody.innerHTML = '';
        if (this.currentCollectionData.length === 0) {
            this.exchangeTableBody.innerHTML = '<tr><td colspan="13" class="text-center py-4 text-gray-500">Nenhum item registrado nesta coleta ainda.</td></tr>';
            return;
        }

        this.currentCollectionData.forEach((item, index) => {
            const row = this.exchangeTableBody.insertRow();
            row.innerHTML = `
                <td class="py-2 px-4">${this.escapeHTML(item.type || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.brand || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.model || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.serialNumber || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.patSiads || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.patEbserh || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.patFub || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.building || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.floor || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.sector || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.user || '')}</td>
                <td class="py-2 px-4">${this.escapeHTML(item.observation || '')}</td>
                <td class="py-2 px-4 text-center">
                    <button onclick="app.editItem(${index})" class="btn-secondary text-sm px-2 py-1 mr-1">Editar</button>
                    <button onclick="app.deleteItem(${index})" class="btn-danger text-sm px-2 py-1">Excluir</button>
                </td>
            `;
        });
    }

    // =============================================================================
    // CSV
    // =============================================================================

    exportCurrentCollection() {
        this.exportCollection(this.currentCollectionName);
    }

    exportCollection(collectionName) {
        const dataToExport = this.allCollections[collectionName] || [];
        if (dataToExport.length === 0) {
            this.showMessage(`A coleta "${collectionName}" não possui dados para exportar.`, 'error');
            return;
        }

        const headers = [
            "TIPO", "MARCA", "MODELO", "NÚMERO DE SÉRIE",
            "PAT. SIADS", "PAT. EBSERH", "PAT. FUB",
            "PRÉDIO", "ANDAR", "SETOR/SALA", "USUÁRIO", "OBSERVAÇÃO"
        ];

        const escapeCsv = (value) => {
            if (value === null || value === undefined) return '';
            let stringValue = String(value);
            if (stringValue.includes(';') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        };

        let csvContent = headers.map(escapeCsv).join(';') + '\n';
        dataToExport.forEach(item => {
            const row = [
                item.type, item.brand, item.model, item.serialNumber,
                item.patSiads, item.patEbserh, item.patFub,
                item.building, item.floor, item.sector, item.user, item.observation
            ].map(escapeCsv).join(';');
            csvContent += row + '\n';
        });

        const csvContentWithBOM = '\uFEFF' + csvContent;

        if (this.csvOutput) {
            this.csvOutput.value = csvContentWithBOM;
        }
        
        if (this.csvOutputContainer) {
            this.csvOutputContainer.classList.remove('hidden');
        }
        
        this.showMessage(`Dados da coleta "${collectionName}" prontos para exportação CSV.`);

        setTimeout(() => {
            if (this.csvOutputContainer) {
                this.csvOutputContainer.classList.add('hidden');
            }
        }, 15000);
    }

    copyCsvToClipboard() {
        if (this.csvOutput) {
            this.csvOutput.select();
            document.execCommand('copy');
            this.showMessage('CSV copiado para a área de transferência!');
        }
    }

    downloadCsv() {
        if (!this.csvOutput || !this.currentCollectionName) return;
        
        const filename = `coleta_${this.currentCollectionName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        const blob = new Blob([this.csvOutput.value], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            this.showMessage('Arquivo CSV baixado!');
        } else {
            this.showMessage('Seu navegador não suporta download direto. Por favor, copie o texto manualmente.', 'error');
        }
    }

    // =============================================================================
    // MODAIS
    // =============================================================================

    showNameCollectionModal(title = "Nome da Nova Coleta", message = "") {
        const modalTitle = document.getElementById('modalTitle');
        if (modalTitle) modalTitle.textContent = title;
        if (this.modalMessage) this.modalMessage.textContent = message;
        if (this.collectionNameInput) this.collectionNameInput.value = '';
        if (this.nameCollectionModal) this.nameCollectionModal.style.display = 'flex';
        
        return new Promise((resolve, reject) => {
            const handleConfirm = () => {
                if (this.nameCollectionModal) this.nameCollectionModal.style.display = 'none';
                this.confirmNameBtn?.removeEventListener('click', handleConfirm);
                this.cancelNameBtn?.removeEventListener('click', handleCancel);
                resolve(this.collectionNameInput?.value.trim() || '');
            };
            const handleCancel = () => {
                if (this.nameCollectionModal) this.nameCollectionModal.style.display = 'none';
                this.confirmNameBtn?.removeEventListener('click', handleConfirm);
                this.cancelNameBtn?.removeEventListener('click', handleCancel);
                reject(new Error('Criação de coleta cancelada.'));
            };
            this.confirmNameBtn?.addEventListener('click', handleConfirm);
            this.cancelNameBtn?.addEventListener('click', handleCancel);
        });
    }

    showConfirmModal(title, message) {
        if (this.confirmModalTitle) this.confirmModalTitle.textContent = title;
        if (this.confirmModalMessage) this.confirmModalMessage.textContent = message;
        if (this.confirmModal) this.confirmModal.style.display = 'flex';
        
        return new Promise((resolve) => {
            const handleConfirm = () => {
                if (this.confirmModal) this.confirmModal.style.display = 'none';
                this.confirmActionBtn?.removeEventListener('click', handleConfirm);
                this.cancelActionBtn?.removeEventListener('click', handleCancel);
                resolve(true);
            };
            const handleCancel = () => {
                if (this.confirmModal) this.confirmModal.style.display = 'none';
                this.confirmActionBtn?.removeEventListener('click', handleConfirm);
                this.cancelActionBtn?.removeEventListener('click', handleCancel);
                resolve(false);
            };
            this.confirmActionBtn?.addEventListener('click', handleConfirm);
            this.cancelActionBtn?.addEventListener('click', handleCancel);
        });
    }

    // =============================================================================
    // UTILIDADES
    // =============================================================================

    showMessage(message, type = 'success') {
        if (!this.messageBox) return;
        
        this.messageBox.textContent = message;
        this.messageBox.className = `message-box ${type}`;
        this.messageBox.classList.remove('hidden');
        setTimeout(() => {
            this.messageBox.classList.add('hidden');
        }, 3000);
    }

    updateRecordCount() {
        if (this.recordCountSpan) {
            this.recordCountSpan.textContent = this.currentCollectionData.length;
        }
    }

    escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // =============================================================================
    // INICIALIZAÇÃO
    // =============================================================================

    async init() {
        try {
            await this.loadAllCollections();
            this.showView('mainScreen');
            console.log('App PWA inicializado com sucesso!');
        } catch (error) {
            console.error('Erro na inicialização:', error);
        }
    }
}

// =============================================================================
// INICIALIZAÇÃO GLOBAL
// =============================================================================

let app;

window.addEventListener('DOMContentLoaded', () => {
    app = new ColetasApp();
    app.init();
});

// Funções globais para compatibilidade com onclick
window.editItem = (index) => app?.editItem(index);
window.deleteItem = (index) => app?.deleteItem(index);