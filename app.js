const BRAND_CONFIG_SAVED = {};

// ===== GLOBAL ERROR LOGGER =====
(function() {
  var _errs = [];
  function _fmt(e, ctx) {
    var ts = new Date().toLocaleTimeString('ru');
    var msg = ctx ? '[' + ctx + '] ' : '';
    if (e && e.message) msg += e.message;
    else msg += String(e);
    var stack = (e && e.stack) ? e.stack.split('\n').slice(0,4).join('\n') : '';
    return { ts: ts, msg: msg, stack: stack, full: ts + ' | ' + msg + (stack ? '\n' + stack : '') };
  }
  function _push(e, ctx) {
    _errs.push(_fmt(e, ctx));
    var cnt = document.getElementById('errLogCount');
    var btn = document.getElementById('errLogBtn');
    if (cnt) cnt.textContent = _errs.length;
    if (btn) btn.style.display = 'flex';
    _renderList();
  }
  function _renderList() {
    var list = document.getElementById('errLogList');
    if (!list) return;
    if (!_errs.length) { list.innerHTML = '<span style="color:#64748b;font-family:\'Inter\',sans-serif;">Ошибок нет</span>'; return; }
    list.innerHTML = _errs.slice().reverse().map(function(e) {
      return '<div style="border:1px solid #7f1d1d;border-radius:6px;padding:8px 10px;background:#450a0a;">'
        + '<div style="color:#fca5a5;margin-bottom:3px;">' + e.ts + ' &mdash; ' + _hesc(e.msg) + '</div>'
        + (e.stack ? '<pre style="margin:0;color:#94a3b8;font-size:10px;white-space:pre-wrap;">' + _hesc(e.stack) + '</pre>' : '')
        + '</div>';
    }).join('');
  }
  function _hesc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  window.onerror = function(msg, src, line, col, err) {
    _push(err || { message: msg + ' (' + src + ':' + line + ')' }, 'global');
  };
  window.addEventListener('unhandledrejection', function(ev) {
    _push(ev.reason || { message: 'Unhandled promise rejection' }, 'promise');
  });
  window._logErr = function(e, ctx) { _push(e, ctx); };
  window.openErrLog  = function() { _renderList(); document.getElementById('errLogModal').style.display = 'flex'; };
  window.closeErrLog = function() { document.getElementById('errLogModal').style.display = 'none'; };
  window.copyErrLog  = function() {
    var txt = _errs.map(function(e){ return e.full; }).join('\n---\n');
    navigator.clipboard && navigator.clipboard.writeText(txt).then(function(){ if(typeof showToast==='function') showToast('Скопировано', 'ok'); });
  };
  window.clearErrLog = function() {
    _errs = [];
    var btn = document.getElementById('errLogBtn');
    var cnt = document.getElementById('errLogCount');
    if (btn) btn.style.display = 'none';
    if (cnt) cnt.textContent = '0';
    _renderList();
  };
})();


let barcodeAliasMap=new Map(),synonymsLoaded=false;

    function resetBarcodeAliases(){
        barcodeAliasMap=new Map();synonymsLoaded=false;
        const s=document.getElementById('synonymsStatus');
        if(s){s.className='upload-status upload-status--idle';s.textContent='Не загружены';}
    }

    function canonicalizeBarcode(rawBarcode) {
        if (rawBarcode === undefined || rawBarcode === null) return { canonical: rawBarcode, wasSynonym: false };
        const b = String(rawBarcode).trim().replace(/\.0+$/, '');
        if (!synonymsLoaded) return { canonical: b, wasSynonym: false };
        const canon = barcodeAliasMap.get(b);
        if (canon && canon !== b) {
            return { canonical: canon, wasSynonym: true };
        }
        return { canonical: b, wasSynonym: false };
    }

    let myPriceData = null;
    let competitorFilesData = [];
    let allFilesData = [];
    let groupedData = [];
    let allColumns = [];
    let visibleColumns = new Set();
    let barcodeColumn = null;
    let nameColumn = null;
    let stockColumn = null;

    let sortMode = 'default';

    const MVS = { ROW_H: 42, OVERSCAN: 30, start: 0, end: 0, ticking: false };
    let _vsData = [];

    let _vsVisibleCols = [];
    let _vsSupplierPriceCols = [];
    let _vsColPayGroupMap = new Map();

    const _DIV_OPTIONS = Array.from({length:99}, (_,i)=>i+2).map(n=>`<option value="${n}">${n}</option>`).join('');
    let _searchDebounceTimer = null;
    let compactMatches = true;
    let searchQuery = '';
    let categoryFilter = '';
    let showFileBarcodes = false;

    let filterNewItems = false;

    let showMinPriceMode = false;

    const myPriceInput = document.getElementById('myPriceInput');
    const competitorInput = document.getElementById('competitorInput');
    const synonymsInput = document.getElementById('synonymsInput');
    const searchInput = document.getElementById('searchInput');
    const bigDiffBtn = document.getElementById('bigDiffBtn');
    const showMyPriceBtn = document.getElementById('showMyPriceBtn');
    const maxCoverageBtn = document.getElementById('maxCoverageBtn');
    const compactMatchesBtn     = document.getElementById('compactMatchesBtn');
    const minPriceBtn           = document.getElementById('minPriceBtn');

    const exportMyPriceBtn = document.getElementById('exportMyPriceBtn');
    const exportAllBtn = document.getElementById('exportAllBtn');
    const exportCurrentBtn = document.getElementById('exportCurrentBtn');
    const clearBtn=document.getElementById('clearBtn');
    const infoPanel = document.getElementById('infoPanel');

    const tableContainer = document.getElementById('tableContainer');
    const _tableContainerInitialHTML = tableContainer ? tableContainer.innerHTML : '';
    // Save monitor instruction HTML before tableContainer gets replaced by data
    const _monitorEmptyStateEl = document.getElementById('monitorEmptyState');
    const _monitorInstrHTML = _monitorEmptyStateEl ? _monitorEmptyStateEl.innerHTML : '';

    const BARCODE_SYNONYMS = [
        'штрих-код', 'штрихкод', 'barcode', 'Штрих-код', 'Штрихкод', 'Barcode',
        'код', 'Код', 'ean', 'EAN', 'ean13', 'EAN13', 'штрих код', 'Штрих код',
        'bar_code', 'bar-code', 'product_code', 'sku', 'SKU', 'артикул', 'Артикул'
    ];

    const NAME_SYNONYMS = [
        'название', 'name', 'Название', 'Name', 'наименование', 'Наименование',
        'товар', 'Товар', 'product', 'Product', 'описание', 'Описание',
        'product_name', 'title', 'Title', 'имя', 'Имя'
    ];

    myPriceInput.addEventListener('change', handleMyPriceUpload);
    competitorInput.addEventListener('change', handleCompetitorUpload);

    searchInput.addEventListener('input', handleSearch);

    const categoryFilterSelect = document.getElementById('categoryFilterSelect');
    if (categoryFilterSelect) {
      categoryFilterSelect.addEventListener('change', function() {
        categoryFilter = this.value;
        // Update visual state
        if (categoryFilter) {
          this.style.background = 'var(--accent-bg)';
          this.style.borderColor = 'var(--accent)';
          this.style.color = 'var(--accent-dark)';
          this.style.fontWeight = '600';
        } else {
          this.style.background = 'var(--surface)';
          this.style.borderColor = 'var(--border-strong)';
          this.style.color = 'var(--text-primary)';
          this.style.fontWeight = '';
        }
        renderTable(true);
      });
    }
    bigDiffBtn.addEventListener('click', toggleBigDiff);
    showMyPriceBtn.addEventListener('click', toggleMyPriceView);
    compactMatchesBtn.addEventListener('click', toggleCompactMatches);
    maxCoverageBtn.addEventListener('click', toggleMaxCoverage);
    if (minPriceBtn) minPriceBtn.addEventListener('click', toggleMinPriceMode);
exportMyPriceBtn.addEventListener('click', async () => await generateExcel('myprice'));
exportAllBtn.addEventListener('click', async () => await generateExcel('all'));
    exportCurrentBtn.addEventListener('click', async () => await generateExcel('current'));

    const _monArchBtn = document.getElementById('monitorDownloadArchiveBtn');
    if (_monArchBtn) {
      _monArchBtn.addEventListener('click', function() {
        const _hdrBtn = document.getElementById('obrHeaderArchiveBtn');
        if (_hdrBtn) _hdrBtn.click();
      });
    }

    clearBtn.addEventListener('click', clearAll);

    if (compactMatches) compactMatchesBtn.classList.add('active');

const PRICE_COL_SYNONYMS = [
  'цена', 'price', 'cost', 'стоимость', 'прайс', 'опт', 'оптов', 'розн', 'ррц', 'рц',
  'retail', 'wholesale'
];

const MY_PRICE_FILE_NAME = 'Мой прайс';
const META_STOCK_KEY = '__meta_stock';
const STOCK_COL_SYNONYMS = ['остаток', 'остатки', 'наличие', 'склад'];

const PRICE_DECIMALS = 1;

function roundPrice(n) {
  const m = 10 ** PRICE_DECIMALS;
  return Math.round(n * m) / m;
}

function isPriceLikeColumn(colName) {
  const s = String(colName || '').toLowerCase();

  const isStock = STOCK_COL_SYNONYMS.some(k => s.includes(k));
  if (isStock) return false;
  return PRICE_COL_SYNONYMS.some(k => s.includes(k));
}

function parsePriceNumber(val) {
  const s = String(val ?? '').trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function getColPayGroup(col){
  // Используем только название колонки, без имени файла.
  // displayName по умолчанию = "fileName - columnName", поэтому отрезаем префикс.
  let n = String(col.displayName || '').toLowerCase();
  const prefix = String(col.fileName || '').toLowerCase() + ' - ';
  if (n.startsWith(prefix)) n = n.slice(prefix.length);
  // Если displayName пустое — берём оригинальное columnName
  if (!n) n = String(col.columnName || '').toLowerCase();
  // Важно: проверяем «безнал»/«бн» РАНЬШЕ «нал», иначе «безнал».includes('нал') даёт ложное срабатывание
  if (n.includes('безнал') || n.includes('бн')) return 'бн';
  if (n.includes('нал')) return 'нал';
  return 'other';
}
function extractPackQtyFromName(name) {
  const s = String(name ?? '');

  const m = s.match(/(\d{1,6})\s*(?:шт|штук)(?=[^0-9A-Za-zА-Яа-я]|$)/i);
  if (!m) return null;
  const q = parseInt(m[1], 10);
  if (!Number.isFinite(q) || q <= 1) return null;
  return q;
}

function samePrice(a, b) {
  const na = parsePriceNumber(a);
  const nb = parsePriceNumber(b);
  if (na !== null && nb !== null) return roundPrice(na) === roundPrice(nb);
  return String(a ?? '').trim() === String(b ?? '').trim();
}
    function removeFileExtension(fileName) {
        return fileName.replace(/\.(csv|xlsx|xls)$/i, '');
    }

    // Обрезает длинное имя файла для шапки таблицы / заголовков Excel
    function truncateFileName(name, maxLen) {
        maxLen = maxLen || 22;
        if (!name || name.length <= maxLen) return name;
        return name.slice(0, maxLen - 1) + '\u2026';
    }

    // Ключи колонок, которые должны иметь жирный левый разделитель (группы нал/бн/поставщик)
    let _vsGroupSepKeys = new Set();

    function handleSearch(e) {
        clearTimeout(_searchDebounceTimer);
        const _newQuery = e.target.value.toLowerCase().trim();
        // If clearing search — apply immediately (no debounce), avoids double-render with category
        if (!_newQuery && !searchQuery) return; // nothing changed
        if (!_newQuery) {
            searchQuery = '';
            renderTable(true);
            return;
        }
        // Non-empty query — debounce to avoid re-renders on every keystroke
        _searchDebounceTimer = setTimeout(() => {
            searchQuery = _newQuery;
            renderTable(true);
        }, 180);
    }

    async function handleMyPriceUpload(e) {
        try {
            const file = e.target.files[0];
            if (!file) return;
            myPriceData = await parseFile(file, 'Мой прайс');
        const _mpSt=document.getElementById('myPriceStatus');if(_mpSt){_mpSt.className='upload-status upload-status--ok';_mpSt.textContent='✅ '+file.name;}
        if (typeof window._sfUpdateMyPrice === 'function') window._sfUpdateMyPrice(file.name, myPriceData && myPriceData.data ? myPriceData.data.length : null);
        if (typeof _slotShowMyPriceChip === 'function') _slotShowMyPriceChip(file.name, myPriceData && myPriceData.data ? myPriceData.data.length : null);
            if (typeof _matcherMarkDirty === 'function') _matcherMarkDirty();
            processAllData();
        } catch (error) {
            const _mpSt=document.getElementById('myPriceStatus');
            if(_mpSt){_mpSt.className='upload-status upload-status--error';_mpSt.textContent='❌ '+error.message;}
            showToast('Ошибка загрузки: ' + error.message, 'err');
        }
    }

    async function handleCompetitorUpload(e) {
        try {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            for (const file of files) {
                const fn = removeFileExtension(file.name);
                const dup = competitorFilesData.findIndex(f => f.fileName === fn);
                if (dup !== -1) {
                    const ok = await jeConfirmDialog('Файл «' + fn + '» уже загружен. Заменить его новой версией?', '🔄 Замена файла');
                    if (!ok) continue;
                    competitorFilesData.splice(dup, 1);
                }
                const fd = await parseFile(file, fn);
                competitorFilesData.push(fd);
            }
            const n = competitorFilesData.length;
            const _cSt = document.getElementById('competitorStatus');
            if (_cSt) { _cSt.className='upload-status upload-status--ok'; _cSt.textContent='✅ '+n+' файл'+(n===1?'':'а'+(n<5?'':'ов')); }
            if (typeof _sfUpdateSuppliers==='function') _sfUpdateSuppliers(competitorFilesData.map(f=>({name:f.fileName,rows:f.data?f.data.length:null})));
            if (typeof _slotHideCompetitorStatus === 'function') _slotHideCompetitorStatus();
            if (typeof _matcherMarkDirty === 'function') _matcherMarkDirty();
            processAllData();
        } catch (error) {
            const _cSt = document.getElementById('competitorStatus');
            if (_cSt) { _cSt.className='upload-status upload-status--error'; _cSt.textContent='❌ '+error.message; }
            showToast('Ошибка загрузки: ' + error.message, 'err');
        }
    }

    window.removeSupplierFile = function(fileName) {
        const idx = competitorFilesData.findIndex(f => f.fileName === fileName);
        // FIX: return a Promise so callers can chain chip.remove() AFTER confirmation
        if (idx === -1) return Promise.resolve(false);
        return jeConfirmDialog('Удалить файл поставщика «' + fileName + '» из мониторинга?', '🗑 Удаление').then(function(ok) {
          if (!ok) return false;
          competitorFilesData.splice(idx, 1);
          const n = competitorFilesData.length;
          const _cSt = document.getElementById('competitorStatus');
          if (_cSt) {
              if (n === 0) { _cSt.className='upload-status upload-status--idle'; _cSt.textContent='Не загружены'; }
              else { _cSt.className='upload-status upload-status--ok'; _cSt.textContent='✅ '+n+' файл'+(n===1?'':'а'+(n<5?'':'ов')); }
          }
          if (typeof _sfUpdateSuppliers==='function') _sfUpdateSuppliers(competitorFilesData.map(f=>({name:f.fileName,rows:f.data?f.data.length:null})));
          if (n > 0 && typeof _slotHideCompetitorStatus === 'function') _slotHideCompetitorStatus();
          if (n === 0 && typeof _slotShowCompetitorStatus === 'function') _slotShowCompetitorStatus('Не загружены');
          if (competitorFilesData.length === 0 && !myPriceData) { clearAll && clearAll(); }
          else { if (typeof _matcherMarkDirty === 'function') _matcherMarkDirty(); processAllData(); }
          showToast('Файл «' + fileName + '» удалён', 'ok');
          return true;
        });
    };
    async function parseFile(file, fileName) {
        try {
            if (file.name.endsWith('.csv')) {
                return await parseCSV(file, fileName);
            } else {
                return await parseExcel(file, fileName);
            }
        } catch (error) {
            throw new Error("Не удалось прочитать файл");
        }
    }

    function parseCSV(file, fileName) {
        return new Promise((resolve, reject) => {

            Papa.parse(file, {
                header: true,
                encoding: 'UTF-8',
                skipEmptyLines: true,
                complete: (results) => {

                    const sample = JSON.stringify(results.data.slice(0, 3));
                    const looksGarbled = sample.includes('\uFFFD') || /[Ã©Â«Â»]/.test(sample);
                    if (looksGarbled) {
                        Papa.parse(file, {
                            header: true,
                            encoding: 'windows-1251',
                            skipEmptyLines: true,
                            complete: (r2) => resolve({ fileName, data: r2.data, isMyPrice: fileName === 'Мой прайс' }),
                            error: () => resolve({ fileName, data: results.data, isMyPrice: fileName === 'Мой прайс' })
                        });
                    } else {
                        resolve({ fileName, data: results.data, isMyPrice: fileName === 'Мой прайс' });
                    }
                },
                error: () => {

                    Papa.parse(file, {
                        header: true,
                        encoding: 'windows-1251',
                        skipEmptyLines: true,
                        complete: (r2) => resolve({ fileName, data: r2.data, isMyPrice: fileName === 'Мой прайс' }),
                        error: (err2) => reject(new Error('CSV parse error: ' + err2.message))
                    });
                }
            });
        });
    }

    function parseExcel(file, fileName) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, {type: 'array'});
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { raw: false, defval: '' });
                    resolve({fileName, data: jsonData, isMyPrice: fileName === 'Мой прайс'});
                } catch (err) {
                    reject(new Error('Excel parse error: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
            reader.readAsArrayBuffer(file);
        });
    }

    function processAllData() {
        if (!myPriceData && competitorFilesData.length === 0) return;
        allFilesData = [];
        _matcherDisabledFiles = new Set();

        if (typeof matcherFileChipsRender === 'function') matcherFileChipsRender();
        if (myPriceData) allFilesData.push(myPriceData);
        allFilesData = allFilesData.concat(competitorFilesData);

        const _currentFileNames = new Set(allFilesData.map(f => f.fileName));
        _matcherDisabledFiles.forEach(n => { if (!_currentFileNames.has(n)) _matcherDisabledFiles.delete(n); });

        autoDetectColumns();
        processData();
        renderTable();
        buildCategoryDropdown();
        updateUI();
        showCompletionToast();
    }

    function detectFileCols(fileData) {
        if (!fileData.data || !fileData.data.length) return;
        const cols = Object.keys(fileData.data[0]);
        fileData._bcCol = cols.find(c => BARCODE_SYNONYMS.some(s => c.toLowerCase().includes(s.toLowerCase()))) || cols[0];
        fileData._nameCol = cols.find(c => c !== fileData._bcCol && NAME_SYNONYMS.some(s => c.toLowerCase().includes(s.toLowerCase())))
            || (cols.length > 1 ? cols[1] : cols[0]);
    }

    function autoDetectColumns() {
        allColumns = [];
        visibleColumns.clear();
        stockColumn = null;
        barcodeColumn = null;
        nameColumn = null;

        allFilesData.forEach(detectFileCols);

        if (allFilesData.length > 0 && allFilesData[0].data.length > 0) {

            barcodeColumn = allFilesData[0]._bcCol;
            nameColumn    = allFilesData[0]._nameCol;

            if (myPriceData && myPriceData.data && myPriceData.data.length > 0) {
                const myCols = Object.keys(myPriceData.data[0]);
                stockColumn = myCols.find(c => STOCK_COL_SYNONYMS.some(s => String(c).toLowerCase().includes(s))) || null;
            }
        }

        allFilesData.forEach((fd) => {
            const { fileName, data } = fd;
            if (data.length > 0) {
                const fileColumns = Object.keys(data[0]);
                fileColumns.forEach(colName => {

                    if (colName === fd._bcCol || colName === fd._nameCol) return;
                    if (fileName === MY_PRICE_FILE_NAME && stockColumn && colName === stockColumn) return;
                    const colKey = `${fileName}|${colName}`;
                    allColumns.push({
                        fileName,
                        columnName: colName,
                        displayName: `${fileName} - ${colName}`,
                        key: colKey
                    });
                    visibleColumns.add(colKey);
                });
            }
        });

        if (stockColumn) {
            const stockCol = { fileName: MY_PRICE_FILE_NAME, columnName: 'Остаток', displayName: 'Остаток', key: META_STOCK_KEY, metaType: 'stock' };
            allColumns.unshift(stockCol);
            visibleColumns.add(META_STOCK_KEY);
        }

        {
            const meta = allColumns.filter(c => c.metaType);
            const myP  = allColumns.filter(c => !c.metaType && c.fileName === MY_PRICE_FILE_NAME);
            const sup  = allColumns.filter(c => !c.metaType && c.fileName !== MY_PRICE_FILE_NAME);
            sup.sort((a,b)=>{const o={нал:0,бн:1,other:2};return(o[getColPayGroup(a)]??2)-(o[getColPayGroup(b)]??2);});
            allColumns = [...meta, ...myP, ...sup];
        }
}


    function processData() {
        const barcodeMap = new Map();

        allFilesData.forEach((fd) => {
            const { fileName, data, isMyPrice } = fd;

            const fileBcCol   = fd._bcCol   || barcodeColumn;
            const fileNameCol = fd._nameCol || nameColumn;
            data.forEach((row, index) => {
                let rawBarcode = row[fileBcCol];
                if (!rawBarcode) return;

                const { canonical, wasSynonym } = canonicalizeBarcode(rawBarcode);
                const barcode = canonical;

                if (!barcodeMap.has(barcode)) {
                    barcodeMap.set(barcode, {
                        barcode,
                        names: [],
                        values: new Map(),
                        isInMyPrice: false,
                        myPriceOrder: -1,
                        filesWithBarcode: new Set(),
                        namesByFile: new Map(),
                        originalBarcodesByFile: new Map(),
                        isSynonym: false
                    });
                }

                const item = barcodeMap.get(barcode);
                item.filesWithBarcode.add(fileName);
                item.originalBarcodesByFile.set(fileName, rawBarcode);

                if (wasSynonym) {
                    item.isSynonym = true;
                }

                if (isMyPrice) {
                    item.isInMyPrice = true;
                    item.myPriceOrder = index;
                }

                const currentRowName = row[fileNameCol];

                    if (isMyPrice && stockColumn) {
                        const stockVal = row[stockColumn];
                        if (!item.values.has(META_STOCK_KEY)) item.values.set(META_STOCK_KEY, []);
                        const arrStock = item.values.get(META_STOCK_KEY);
                        arrStock.length = 0;
                        arrStock.push({ val: (stockVal === undefined || stockVal === null) ? '' : stockVal, rowName: currentRowName, originalBarcode: rawBarcode, meta: true });
                    }

                if (currentRowName) {
                    const nameObj = {fileName, name: currentRowName};
                    if (!item.names.some(n => n.fileName === fileName && n.name === currentRowName)) {
                        item.names.push(nameObj);
                    }
                    if (!item.namesByFile.has(fileName)) {
                        item.namesByFile.set(fileName, currentRowName);
                    }

                    if (isMyPrice) {

                        const vals = Object.values(row).map(v => (v === undefined || v === null) ? '' : String(v));
                        for (const t of vals) {
                            const q = extractPackQtyFromName(t);
                            if (q) { item.packQty = q; break; }
                        }
                    }
                }

                Object.keys(row).forEach(colName => {
                    if (colName !== fileBcCol && colName !== fileNameCol) {
                        const key = `${fileName}|${colName}`;
                        const value = row[colName];
                        if (value !== undefined && value !== null && value !== '') {
                            if (!item.values.has(key)) {
                                item.values.set(key, []);
                            }
                            const arr = item.values.get(key);

                            if (isPriceLikeColumn(colName)) {
                                const exists = arr.some(v => samePrice(v.val, value));
                                if (!exists) {
                                    arr.push({val: value, rowName: currentRowName, originalBarcode: rawBarcode});
                                }
                            } else {
                                arr.push({val: value, rowName: currentRowName, originalBarcode: rawBarcode});
                            }
                        }
                    }
                });
            });
        });

        groupedData = Array.from(barcodeMap.values()).map(item => {
            const visibleCols = allColumns.filter(col => visibleColumns.has(col.key));
            const numericValues = [];
            visibleCols.forEach(col => {
                const valuesArr = item.values.get(col.key);
                if (valuesArr && valuesArr.length > 0) {
                    valuesArr.forEach(vObj => {
                        const numValue = parseFloat(String(vObj.val).replace(/[^0-9.,]/g, '').replace(',', '.'));
                        if (!isNaN(numValue) && numValue > 0) {
                            numericValues.push(numValue);
                        }
                    });
                }
            });

            const hasMyPriceLoaded = !!myPriceData;
            const packQty = (hasMyPriceLoaded && item.packQty) ? item.packQty : null;
            let autoDivFactor = null;

            if (packQty) {

                const cols2 = allColumns;

                const supplierPriceCols2 = cols2.filter(col => !col.metaType && col.fileName !== MY_PRICE_FILE_NAME && isPriceLikeColumn(col.columnName));

                const myPriceCols2 = cols2.filter(col => !col.metaType && col.fileName === MY_PRICE_FILE_NAME && isPriceLikeColumn(col.columnName));

                const myNums2 = [];
                myPriceCols2.forEach(col => {
                    const arr = item.values.get(col.key);
                    if (!arr || arr.length === 0) return;
                    arr.forEach(v => {
                        const n = parsePriceNumber(v.val);
                        if (n !== null && n > 0) myNums2.push(n);
                    });
                });
                const myMin2 = myNums2.length ? Math.min(...myNums2) : null;

                const supplierNums2 = [];
                supplierPriceCols2.forEach(col => {
                    const arr = item.values.get(col.key);
                    if (!arr || arr.length === 0) return;
                    arr.forEach(v => {
                        const n = parsePriceNumber(v.val);
                        if (n !== null && n > 0) supplierNums2.push(n);
                    });
                });

                if (supplierNums2.length > 0) {
                    const minSupplier = Math.min(...supplierNums2);
                    const thresholdSupplier = minSupplier * 3;

                    const allSuppliers3xAboveMy = (myMin2 !== null) && supplierNums2.every(n => n >= myMin2 * 3);

                    let changed2 = false;
                    supplierPriceCols2.forEach(col => {
                        const arr = item.values.get(col.key);
                        if (!arr || arr.length === 0) return;
                        arr.forEach(vObj => {
                            const n = parsePriceNumber(vObj.val);
                            if (n === null || n <= 0) return;

                            if (allSuppliers3xAboveMy || n >= thresholdSupplier) {
                                if (vObj._autoDiv) return;
                                vObj._origVal = vObj.val;
                                vObj.val = roundPrice(n / packQty);
                                vObj._autoDiv = true;
                                vObj._autoDivFactor = packQty;
                                changed2 = true;
                            }
                        });
                    });

                    if (changed2) autoDivFactor = packQty;
                }
            }
            let priceDiffPercent = 0;
            if (numericValues.length > 1) {
                const minPrice = Math.min(...numericValues);
                const maxPrice = Math.max(...numericValues);
                if (minPrice > 0) {
                    priceDiffPercent = ((maxPrice - minPrice) / minPrice) * 100;
                }
            }

            const filesWithPrices = new Set();
            for (const [key, valuesArr] of item.values.entries()) {
                if (key.startsWith('__')) continue;

                if (valuesArr && valuesArr.length > 0) {
                    const fileName = key.split('|')[0];
                    if (fileName && fileName !== MY_PRICE_FILE_NAME) {
                        filesWithPrices.add(fileName);
                    }
                }
            }
            const coverageCount = filesWithPrices.size;

            if (stockColumn) {
                if (!item.values.has(META_STOCK_KEY)) {
                    item.values.set(META_STOCK_KEY, [{ val: '', rowName: '', originalBarcode: item.barcode, meta: true }]);
                }
            }

return { barcode: item.barcode, packQty, autoDivFactor,
                names: item.names,
                namesByFile: item.namesByFile,
                values: item.values,
                isInMyPrice: item.isInMyPrice,
                myPriceOrder: item.myPriceOrder,
                originalFileCount: item.filesWithBarcode.size,
                priceDiffPercent,
                coverageCount,
                isSynonym: item.isSynonym,
                originalBarcodesByFile: item.originalBarcodesByFile
            };
        });
    }

    function _clearAllFilterBtns() {
        sortMode = 'default';
        filterNewItems = false;
        bigDiffBtn.classList.remove('active');
        showMyPriceBtn.classList.remove('active');
        maxCoverageBtn.classList.remove('active');
        // NOTE: showMinPriceMode is visual-only (cell highlighting), not a row filter.
        // It is intentionally NOT reset here so min-price highlight survives switching other filters.
    }

    function toggleMinPriceMode() {
        if (showMinPriceMode) {
            showMinPriceMode = false;
            if (minPriceBtn) minPriceBtn.classList.remove('active');
        } else {
            showMinPriceMode = true;
            if (minPriceBtn) minPriceBtn.classList.add('active');
        }
        renderTable(true);
    }

    function toggleBigDiff() {
        if (sortMode === 'bigdiff') {
            _clearAllFilterBtns();
        } else {
            _clearAllFilterBtns();
            sortMode = 'bigdiff';
            bigDiffBtn.classList.add('active');
        }
        renderTable(true);
    }

    function toggleMyPriceView() {
        if (sortMode === 'myprice') {
            _clearAllFilterBtns();
        } else {
            _clearAllFilterBtns();
            sortMode = 'myprice';
            showMyPriceBtn.classList.add('active');
        }
        renderTable(true);
    }

    function toggleMaxCoverage() {
        if (filterNewItems) {
            _clearAllFilterBtns();
        } else {
            if (!myPriceData) {
                showToast('Загрузите свой прайс — иначе нет смысла искать новинки', 'warn');
                return;
            }
            _clearAllFilterBtns();
            filterNewItems = true;
            maxCoverageBtn.classList.add('active');
        }
        renderTable(true);
    }

    function toggleCompactMatches() {
        compactMatches = !compactMatches;
        if (compactMatches) compactMatchesBtn.classList.add('active');
        else compactMatchesBtn.classList.remove('active');
        renderTable(true);

    }

    // Build category dropdown from top-100 frequent words in all product names
    function buildCategoryDropdown() {
      const sel = document.getElementById('categoryFilterSelect');
      if (!sel || !groupedData || !groupedData.length) return;

      // Build synonym→canonical map from _brandDB
      const synToCanon = new Map();
      if (typeof _brandDB !== 'undefined' && _brandDB) {
        Object.entries(_brandDB).forEach(([key, val]) => {
          const canon = key.toLowerCase();
          synToCanon.set(canon, canon);
          (val.synonyms || []).forEach(s => { if (s) synToCanon.set(s.toLowerCase(), canon); });
        });
      }

      const freq = {};
      const rePunct = /[«»""''()\[\]{}\\/|.,;:!?@#$%^&*+=<>~`№—–\-]/g;
      groupedData.forEach(item => {
        // count each canonical once per item (not per name occurrence)
        const seenCanons = new Set();
        item.names.forEach(n => {
          if (!n.name) return;
          const words = n.name.replace(rePunct, ' ').split(/\s+/);
          words.forEach(w => {
            const wl = w.toLowerCase().trim();
            if (wl.length < 3) return;
            if (/^\d+([.,]\d+)?$/.test(wl)) return;
            if (/^\d/.test(wl)) return;
            // map to canonical if synonym
            const canon = synToCanon.get(wl) || wl;
            // if whitelist active: skip words not in the whitelist
            if (_catWordsExpanded.size > 0 && !_catWordsExpanded.has(wl) && !_catWordsExpanded.has(canon)) return;
            if (!seenCanons.has(canon)) {
              seenCanons.add(canon);
              freq[canon] = (freq[canon] || 0) + 1;
            }
          });
        });
      });

      // Top 100 by frequency
      const top = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([w]) => w);

      // Preserve current selection
      const prev = sel.value;
      sel.innerHTML = '<option value="">Категории</option>';
      top.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w;
        opt.textContent = w.charAt(0).toUpperCase() + w.slice(1);
        sel.appendChild(opt);
      });
      if (prev && top.includes(prev)) {
        sel.value = prev;
      } else if (prev && !top.includes(prev)) {
        // Active category no longer in list — reset and re-render
        categoryFilter = '';
        sel.value = '';
        sel.style.background = 'var(--surface)';
        sel.style.borderColor = 'var(--border-strong)';
        sel.style.color = 'var(--text-primary)';
        sel.style.fontWeight = '';
        // Defer renderTable so buildCategoryDropdown finishes first
        setTimeout(function() { if (typeof renderTable === 'function') renderTable(true); }, 0);
      }
      // update category words modal if open
      _catExclUpdateBadge();
    }

    function _getCategoryWords(cf) {
        // Возвращает Set слов для поиска: само слово + синонимы из базы брендов
        const words = new Set([cf]);
        try {
            if (typeof _brandDB === 'undefined' || !_brandDB) return words;
            // Прямое вхождение: _brandDB["чай"] → synonyms: ["tea", ...]
            if (_brandDB[cf]) {
                (_brandDB[cf].synonyms || []).forEach(s => { if (s) words.add(s.toLowerCase()); });
            }
            // Обратное: cf является синонимом в чужой записи → добавляем каноническое + все синонимы группы
            Object.entries(_brandDB).forEach(function([key, val]) {
                const syns = (val.synonyms || []).map(s => s.toLowerCase());
                if (key.toLowerCase() === cf || syns.includes(cf)) {
                    words.add(key.toLowerCase());
                    syns.forEach(s => { if (s) words.add(s); });
                }
            });
        } catch(e) {}
        return words;
    }

    function getSortedData() {
        let data = [...groupedData];

        if (searchQuery) {
            // Expand search query with brand synonyms from _brandDB
            const _sqWords = new Set([searchQuery]);
            try {
                if (typeof _brandDB !== 'undefined' && _brandDB) {
                    Object.entries(_brandDB).forEach(function([key, val]) {
                        const canon = key.toLowerCase();
                        const syns = (val.synonyms || []).map(s => s.toLowerCase()).filter(Boolean);
                        // if query matches canonical or any synonym — add whole group
                        if (canon === searchQuery || canon.includes(searchQuery) ||
                            searchQuery.includes(canon) ||
                            syns.some(s => s === searchQuery || s.includes(searchQuery) || searchQuery.includes(s))) {
                            _sqWords.add(canon);
                            syns.forEach(s => _sqWords.add(s));
                        }
                    });
                }
            } catch(e) {}
            const _sqArr = [..._sqWords];
            data = data.filter(item =>
                item.names.some(n => {
                    if (!n.name) return false;
                    const nl = n.name.toLowerCase();
                    return _sqArr.some(w => nl.includes(w));
                })
            );
        }

        if (categoryFilter) {
            const cf = categoryFilter.toLowerCase();
            const _cfWords = _getCategoryWords(cf);
            data = data.filter(item =>
                item.names.some(n => n.name && n.name.toLowerCase().split(/[\s«»""''()\[\]{}\\/|.,;:!?@#$%^&*+=<>~`№—–\-]+/).some(w => _cfWords.has(w)))
            );
        }

        if (filterNewItems) {
            data = data.filter(item => !item.isInMyPrice);
            data.sort((a, b) => {
                if (b.coverageCount !== a.coverageCount) return b.coverageCount - a.coverageCount;
                if (b.originalFileCount !== a.originalFileCount) return b.originalFileCount - a.originalFileCount;
                const nameA = (a.names[0]?.name || '').toLowerCase();
                const nameB = (b.names[0]?.name || '').toLowerCase();
                return nameA.localeCompare(nameB, 'ru');
            });
        }

        if (sortMode === 'bigdiff') {
            data = data.filter(item => item.originalFileCount > 1 && item.priceDiffPercent > 10);
            data.sort((a, b) => b.priceDiffPercent - a.priceDiffPercent);
        } else if (sortMode === 'myprice') {
            data = data.filter(item => item.isInMyPrice);
            data.sort((a, b) => a.myPriceOrder - b.myPriceOrder);
        } else if (sortMode === 'maxcoverage') {
            data.sort((a, b) => b.coverageCount - a.coverageCount);
        }

        return data;
    }

    function copyBarcode(barcode, btn) {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(String(barcode)).then(() => {
            const orig = btn.textContent;
            btn.textContent = '✓';
            setTimeout(() => {
                btn.textContent = orig;
            }, 600);
        }).catch(() => {
        });
    }


    function _mvsBuildHeader(visibleCols) {
        let h = `<tr>`;
        h += `<th class="col-barcode">Штрихкод</th>`;
        allFilesData.forEach(({fileName}, idx) => {
            const ec = showFileBarcodes ? '' : 'hidden-barcode-col';
            h += `<th class="col-barcode file-barcode-col ${ec}" data-file-index="${idx}" title="Штрихкод (${fileName})">Штрихкод (${truncateFileName(fileName, 18)})</th>`;
        });
        h += `<th class="col-name">${nameColumn}</th>`;
        visibleCols.forEach(col => {
            const _isMyP = !col.metaType && col.fileName === MY_PRICE_FILE_NAME;
            const _isMeta = !!col.metaType;
            const _cL = col.metaType ? col.displayName : col.columnName;
            const _fL = col.metaType ? null : col.fileName;
            const _ck = col.key.replace(/'/g, "\\'");
            const _sep = _vsGroupSepKeys.has(col.key) ? ' col-group-sep' : '';
            if (_isMyP || _isMeta) {
                h += `<th class="${_isMyP ? 'col-my-price' : 'col-meta'}${_sep}" data-col-key="${_ck}" title="${MY_PRICE_FILE_NAME} — ${_cL}"><div class="column-header"><div class="column-file-name column-file-name--my-price">${MY_PRICE_FILE_NAME}</div><div class="column-header-title"><span class="column-name-text">${_cL}</span></div></div></th>`;
            } else {
                h += `<th class="${_sep.trim()}" data-col-key="${_ck}" title="${_fL} — ${_cL}"><div class="column-header"><div class="column-file-name" title="${_fL}">${truncateFileName(_fL)}</div><div class="column-header-title"><span class="column-name-text">${_cL}</span></div></div></th>`;
            }
        });
        h += `</tr>`;
        return h;
    }
    function _mvsRenderRow(item, visibleCols, supplierPriceCols, colPayGroupMap) {
        let rowClass = '';
        if (item.isSynonym) rowClass = 'synonym-row';
        else if (item.isInMyPrice) rowClass = 'my-price-row';
        rowClass += (rowClass ? ' ' : '') + 'group-border-top group-border-bottom';

        let html = `<tr class="${rowClass}" data-barcode="${item.barcode}" data-in-my-price="${item.isInMyPrice?'1':'0'}" data-is-synonym="${item.isSynonym?'1':'0'}">`;

        const _bcInDB = typeof jeDB !== 'undefined' && (jeDB[item.barcode] !== undefined);
        const _bcBadge = _bcInDB
          ? `<span class="bc-in-db-badge" title="Штрихкод уже есть в базе кросскодов">📚</span>`
          : `<button class="bc-add-db-btn" title="Добавить в базу кросскодов" onclick="openAddToDB('${item.barcode.replace(/'/g,"\\'").replace(/"/g,'&quot;')}',this)">+</button>`;
        html += `<td class="col-barcode"><div class="barcode-cell"><span class="barcode-text" title="${item.barcode}">${item.barcode}</span><button class="copy-btn" onclick="copyBarcode('${item.barcode}',this)">📋</button>${_bcBadge}</div></td>`;

        allFilesData.forEach(({fileName}, idx) => {
            const ec = showFileBarcodes ? '' : 'hidden-barcode-col';
            const ob = item.originalBarcodesByFile.get(fileName) || '—';
            html += `<td class="col-barcode file-barcode-col ${ec}" data-file-index="${idx}"><div class="barcode-cell"><span class="barcode-text">${ob}</span>${ob!=='—'?`<button class="copy-btn" onclick="copyBarcode('${ob}',this)">📋</button>`:''}</div></td>`;
        });

        if (compactMatches && item.names.length > 1) {

            const _nmC = new Map();
            item.names.forEach(n => { if (!_nmC.has(n.name)) _nmC.set(n.name, n.fileName); });
            const _firstName = [..._nmC.keys()][0];
            const _allNames = [..._nmC.keys()].join(' | ');
            const _extraCount = _nmC.size - 1;
            // data-pm-names: [{file, name, barcode}] для тултипа
            const _tipData = JSON.stringify([..._nmC.entries()].map(([name, file]) => ({
                file, name, barcode: item.originalBarcodesByFile.get(file) || ''
            })));
            html += `<td class="col-name" data-pm-names="${esc(_tipData)}"><div class="name-compact" title="${esc(_allNames)}">${esc(_firstName)}<span style="color:var(--text-muted);font-size:10px;margin-left:4px;">(+${_extraCount})</span></div></td>`;
        } else if (item.names.length > 0) {
            const _nm = new Map();
            item.names.forEach(n => { if (!_nm.has(n.name)) _nm.set(n.name, n.fileName); });
            const _tipData = JSON.stringify([..._nm.entries()].map(([name, file]) => ({
                file, name, barcode: item.originalBarcodesByFile.get(file) || ''
            })));
            html += `<td class="col-name" data-pm-names="${esc(_tipData)}"><div class="name-cell">`;
            _nm.forEach((fn, name) => { html += `<div class="name-item" title="📁 ${esc(fn)}">${esc(name)}</div>`; });
            html += `</div></td>`;
        } else {
            html += `<td class="col-name">Без названия</td>`;
        }

        const numericValues = [];
        const _gn = {'нал':[], 'бн':[], 'other':[]};

        const _supFilesWithPrice = new Set();
        supplierPriceCols.forEach(col => {
            const _g = colPayGroupMap.get(col.key) || 'other';
            const valuesArr = item.values.get(col.key);
            if (valuesArr) valuesArr.forEach(vObj => {
                const n = parsePriceNumber(vObj.val);
                if (n !== null && n > 0) { numericValues.push(n); _gn[_g].push(n); _supFilesWithPrice.add(col.fileName); }
            });
        });

        const _multiSuppliers = _supFilesWithPrice.size > 1;
        const _gMin = {
            'нал': _gn['нал'].length > 0 ? Math.min(..._gn['нал']) : null,
            'бн':  _gn['бн'].length  > 0 ? Math.min(..._gn['бн'])  : null,
            'other': _gn['other'].length > 0 ? Math.min(..._gn['other']) : null
        };

        const _gFilesPerGroup = {'нал': new Set(), 'бн': new Set(), 'other': new Set()};
        supplierPriceCols.forEach(col => {
            const _g = colPayGroupMap.get(col.key) || 'other';
            const valuesArr = item.values.get(col.key);
            if (valuesArr && valuesArr.some(v => { const n = parsePriceNumber(v.val); return n !== null && n > 0; })) {
                _gFilesPerGroup[_g].add(col.fileName);
            }
        });
        const _gM = { 'нал': _gFilesPerGroup['нал'].size > 1, 'бн': _gFilesPerGroup['бн'].size > 1, 'other': _gFilesPerGroup['other'].size > 1 };
        const globalMin = numericValues.length > 0 ? Math.min(...numericValues) : null;
        const globalMax = numericValues.length > 0 ? Math.max(...numericValues) : null;
        const hasMultipleGlobals = _multiSuppliers && numericValues.length > 1;

        let _absMin = null;
        if (showMinPriceMode) {
            const _allPriceNums = [];
            visibleCols.forEach(col => {
                if (col.metaType) return;

                const valuesArr = item.values.get(col.key);
                if (valuesArr) valuesArr.forEach(vObj => {
                    const n = parsePriceNumber(vObj.val);
                    if (n !== null && n > 0) _allPriceNums.push(n);
                });
            });
            _absMin = _allPriceNums.length > 0 ? Math.min(..._allPriceNums) : null;
        }

        visibleCols.forEach(col => {
            const valuesArr = item.values.get(col.key);
            let cellContent = '—';
            if (col.metaType) {
                const _mv = (valuesArr && valuesArr.length > 0) ? valuesArr[0].val : '';
                const _mvStr = (_mv === undefined || _mv === null) ? '' : String(_mv).trim();
                if (!_mvStr) {
                    cellContent = '—';
                } else {

                    const _mn = parseFloat(_mvStr.replace(/\s/g, '').replace(',', '.'));
                    if (!isNaN(_mn) && showMinPriceMode && _absMin !== null && _mn === _absMin) {
                        cellContent = `<span class="price-val is-abs-min" title="Минимальная цена в строке">${Math.floor(_mn)}</span>`;
                    } else {
                        cellContent = !isNaN(_mn) ? String(Math.floor(_mn)) : _mvStr;
                    }
                }
                html += `<td class="col-meta${_vsGroupSepKeys.has(col.key) ? ' col-group-sep' : ''}">${cellContent}</td>`; return;
            }
            if (valuesArr && valuesArr.length > 0) {
                cellContent = '<div class="multi-value-container">';
                // compute cell-level min/max for price warning
                const _cellNums = valuesArr.map(v => parseFloat(String(v.val).replace(/[^0-9.,]/g,'').replace(',','.'))).filter(n => !isNaN(n) && n > 0);
                const _cellMin = _cellNums.length > 1 ? Math.min(..._cellNums) : null;
                const _cellMax = _cellNums.length > 1 ? Math.max(..._cellNums) : null;
                valuesArr.forEach((vObj, vIndex) => {
                    let displayValue, isMin = false, isAbsMin = false, isMax = false, numValue = null;
                    const parsed = parseFloat(String(vObj.val).replace(/[^0-9.,]/g, '').replace(',', '.'));
                    if (!isNaN(parsed) && parsed > 0) {
                        numValue = parsed;
                        displayValue = parsed.toFixed(PRICE_DECIMALS).replace(/\.0+$/, '');
                        const _pg = colPayGroupMap.get(col.key) || 'other';
                        if (!showMinPriceMode) {
                            if (_gM[_pg] && _gMin[_pg] !== null && parsed === _gMin[_pg]) isMin = true;
                            if (hasMultipleGlobals && parsed === globalMax && globalMax >= 3 * globalMin) isMax = true;
                        } else {

                            if (_absMin !== null && parsed === _absMin) isAbsMin = true;
                        }
                    } else { displayValue = vObj.val; }
                    const barcodeForCopy = vObj.originalBarcode || item.barcode;
                    const autoBadge = vObj._autoDiv ? `<span class="auto-div-badge" title="Автоделение /${vObj._autoDivFactor || item.packQty}">÷</span>` : '';
                    const _divF = vObj._autoDiv ? (vObj._autoDivFactor || item.packQty || 1) : 1;
                    const _cMin = (_cellMin !== null && numValue !== null) ? _cellMin : 0;
                    const _cMax = (_cellMax !== null && numValue !== null) ? _cellMax : 0;
                    // Key includes vIndex so two prices in the same column are independent cart lines
                    const _cartKey = barcodeForCopy + '|' + col.key + '|' + vIndex;
                    const _inCart = window._cartedKeys && window._cartedKeys.has(_cartKey);
                    const _cartCls = _inCart ? ' price-in-cart' : '';
                    let innerHtml;
                    if (isAbsMin) {
                        innerHtml = `<span class="price-val is-abs-min price-clickable${_cartCls}" onclick="priceClick('${barcodeForCopy}','${col.key}','${displayValue}','${item.barcode}',${_divF},${_cMin},${_cMax},0,${vIndex})" title="Минимальная цена в строке">${displayValue}</span>${autoBadge}`;
                    } else if (isMin) {
                        innerHtml = `<span class="price-val is-min price-clickable${_cartCls}" onclick="priceClick('${barcodeForCopy}','${col.key}','${displayValue}','${item.barcode}',${_divF},${_cMin},${_cMax},0,${vIndex})">${displayValue}</span>${autoBadge}`;
                    } else if (isMax && numValue) {
                        innerHtml = `<span class="price-clickable${_cartCls}" onclick="priceClick('${barcodeForCopy}','${col.key}','${displayValue}','${item.barcode}',${_divF},${_cMin},${_cMax},1,${vIndex})">${displayValue}</span>${autoBadge}<div class="div-wrapper" title="Цена указана за блок?"><div class="div-icon">÷</div><select class="div-select" onchange="dividePrice('${item.barcode}','${col.key}',${vIndex},this.value);this.value=''"><option value="" disabled selected>÷</option>${_DIV_OPTIONS}</select></div>`;
                    } else {
                        innerHtml = `<span class="price-clickable${_cartCls}" onclick="priceClick('${barcodeForCopy}','${col.key}','${displayValue}','${item.barcode}',${_divF},${_cMin},${_cMax},0,${vIndex})">${displayValue}</span>${autoBadge}`;
                    }
                    cellContent += `<div class="value-variant">${innerHtml}</div>`;
                });
                cellContent += '</div>';
            }
            html += `<td${_vsGroupSepKeys.has(col.key) ? ' class="col-group-sep"' : ''}>${cellContent}</td>`;
        });
        html += '</tr>';
        return html;
    }

    function _mvsRenderVisible() {
        const wrap = document.getElementById('mainTableWrap');
        if (!wrap) return;
        const total = _vsData.length;
        if (!total) return;
        const scrollTop = wrap.scrollTop;
        const viewH = wrap.clientHeight || 600;
        MVS.start = Math.max(0, Math.floor(scrollTop / MVS.ROW_H) - MVS.OVERSCAN);
        MVS.end = Math.min(total, Math.ceil((scrollTop + viewH) / MVS.ROW_H) + MVS.OVERSCAN);
        const topPad = MVS.start * MVS.ROW_H;
        const botPad = Math.max(0, total - MVS.end) * MVS.ROW_H;
        const tbody = document.getElementById('mainTbody');
        if (!tbody) return;
        const colSpan = 3 + allFilesData.length + _vsVisibleCols.length;
        let rows = '';
        for (let i = MVS.start; i < MVS.end; i++) {
            rows += _mvsRenderRow(_vsData[i], _vsVisibleCols, _vsSupplierPriceCols, _vsColPayGroupMap);
        }
        tbody.innerHTML =
            (topPad > 0 ? `<tr style="height:${topPad}px;border:none;pointer-events:none;"><td colspan="${colSpan}" style="padding:0;border:none;"></td></tr>` : '') +
            rows +
            (botPad > 0 ? `<tr style="height:${botPad}px;border:none;pointer-events:none;"><td colspan="${colSpan}" style="padding:0;border:none;"></td></tr>` : '');
    }

    function renderTable(preserveScroll = false) {
        let dataToShow = getSortedData();
        // ── DELTA % FILTER HOOK ──
        if (window._deltaFilterActive && typeof window._deltaApplyToData === 'function') {
            dataToShow = window._deltaApplyToData(dataToShow);
        }        _vsData = dataToShow;

        if (dataToShow.length === 0) {
            tableContainer.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Нет данных для отображения</h3><p>Проверьте содержимое загруженных файлов или измените фильтры</p></div>`;
            return;
        }

        _vsVisibleCols = allColumns.filter(col => visibleColumns.has(col.key));
        _vsSupplierPriceCols = _vsVisibleCols.filter(col => !col.metaType && col.fileName !== MY_PRICE_FILE_NAME && isPriceLikeColumn(col.columnName));
        _vsColPayGroupMap = new Map();
        _vsVisibleCols.forEach(col => _vsColPayGroupMap.set(col.key, getColPayGroup(col)));

        // Вычисляем ключи колонок с жирным левым разделителем (мой прайс→поставщик, нал→бн→прочие)
        _vsGroupSepKeys = new Set();
        // Разделитель: остаток(meta) → первая колонка моего прайса
        const _vsMetaEnd = _vsVisibleCols.findIndex(c => !c.metaType);
        if (_vsMetaEnd > 0) _vsGroupSepKeys.add(_vsVisibleCols[_vsMetaEnd].key);
        // Разделитель: мой прайс → первый поставщик
        const _vsFsi = _vsVisibleCols.findIndex(c => !c.metaType && c.fileName !== MY_PRICE_FILE_NAME);
        if (_vsFsi > 0) _vsGroupSepKeys.add(_vsVisibleCols[_vsFsi].key);
        // Разделители нал/бн/прочие внутри поставщиков
        for (let _vi = 1; _vi < _vsVisibleCols.length; _vi++) {
            const _vp = _vsVisibleCols[_vi - 1], _vc = _vsVisibleCols[_vi];
            if (!_vc.metaType && _vc.fileName !== MY_PRICE_FILE_NAME
                && !_vp.metaType && _vp.fileName !== MY_PRICE_FILE_NAME
                && getColPayGroup(_vp) !== getColPayGroup(_vc)) {
                _vsGroupSepKeys.add(_vc.key);
            }
        }

        let wrap = document.getElementById('mainTableWrap');
        if (!wrap) {

            tableContainer.innerHTML = `
                <div id="mainTableWrap" style="overflow-y:scroll;overflow-x:auto;max-height:75vh;border:1px solid var(--border);border-radius:4px;" class="table-wrapper">
                    <table id="mainTable" style="width:100%;border-collapse:collapse;min-width:700px;">
                        <thead id="mainThead"></thead>
                        <tbody id="mainTbody"></tbody>
                    </table>
                </div>`;
            wrap = document.getElementById('mainTableWrap');

            wrap.addEventListener('scroll', () => {
                if (!MVS.ticking) {
                    MVS.ticking = true;
                    requestAnimationFrame(() => { _mvsRenderVisible(); MVS.ticking = false; });
                }
            }, { passive: true });
        }

        document.getElementById('mainThead').innerHTML = _mvsBuildHeader(_vsVisibleCols);

        const _prevScroll = preserveScroll ? wrap.scrollTop : 0;
        wrap.scrollTop = 0;
        MVS.start = 0; MVS.end = 0;

        _mvsRenderVisible();

        if (preserveScroll && _prevScroll > 0) {
            // Double-rAF: first frame lets the browser apply the reflow from
            // innerHTML changes, second frame restores scroll after it settles
            requestAnimationFrame(function() {
                requestAnimationFrame(function() { wrap.scrollTop = _prevScroll; });
            });
        }
        // ── DELTA COLUMN HIGHLIGHT ──
        requestAnimationFrame(function() {
            if (typeof window._deltaHighlightCols === 'function') window._deltaHighlightCols();
        });
    }

    function dividePrice(barcode, colKey, valueIndex, factorStr) {
        const factor = parseFloat(factorStr);
        if (!factor || factor <= 0) return;

        const item = groupedData.find(x => String(x.barcode) === String(barcode));
        if (!item) return;

        const visibleCols = allColumns.filter(col => visibleColumns.has(col.key));
        const priceCols = visibleCols.filter(col => !col.metaType && isPriceLikeColumn(col.columnName));
        const nums = [];
        priceCols.forEach(col => {
            const arr = item.values.get(col.key);
            if (!arr || arr.length === 0) return;
            arr.forEach(v => {
                const n = parsePriceNumber(v.val);
                if (n !== null && n > 0) nums.push(n);
            });
        });
        if (nums.length === 0) return;

        const minValue = Math.min(...nums);
        const threshold = minValue * 3;

        let changed = false;
        priceCols.forEach(col => {
            const arr = item.values.get(col.key);
            if (!arr || arr.length === 0) return;
            arr.forEach(vObj => {
                const n = parsePriceNumber(vObj.val);
                if (n === null || n <= 0) return;
                if (n > threshold) {
                    vObj.val = roundPrice(n / factor);
                    // Bug fix: persist the manual division so re-rendered cells
                    // pass the correct divFactor to priceClick (was always 1 before)
                    vObj._autoDiv = true;
                    vObj._autoDivFactor = factor;
                    changed = true;
                }
            });
        });

        if (!changed) return;
        renderTable(true);

    }

    async function saveBlobWithDialogOrDownload(blob, fileName) {

        if (window.showSaveFilePicker) {
            const ext = fileName.split('.').pop().toLowerCase();
            const mimeMap = {
                xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                json: 'application/json',
                csv:  'text/csv',
            };
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    startIn: 'desktop',
                    types: [{ description: fileName, accept: { [mimeMap[ext] || 'application/octet-stream']: ['.' + ext] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;

            }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function generateExcel(mode) {
    try {
    const _exMeta=allColumns.filter(c=>c.metaType&&visibleColumns.has(c.key));
    const _exMyP =allColumns.filter(c=>!c.metaType&&c.fileName===MY_PRICE_FILE_NAME&&visibleColumns.has(c.key));
    const _exSup =allColumns.filter(c=>!c.metaType&&c.fileName!==MY_PRICE_FILE_NAME&&visibleColumns.has(c.key));
    const excelCols=[..._exMeta,..._exMyP,..._exSup];
    const fileNames=allFilesData.map(f=>f.fileName);
    const hasMyPrice=!!myPriceData;
    const myPriceFileName=hasMyPrice?MY_PRICE_FILE_NAME:null;
    const nameFileOrder=[];
    if(hasMyPrice) nameFileOrder.push(myPriceFileName);
    fileNames.forEach(fn=>{if(!hasMyPrice||fn!==myPriceFileName)nameFileOrder.push(fn);});
    const priceStartColBase=1+fileNames.length+nameFileOrder.length;

    const thickLeftAt=new Set();
    // Разделитель: остаток(meta) → первая колонка моего прайса
    const _fsiMyP=excelCols.findIndex(c=>!c.metaType&&c.fileName===MY_PRICE_FILE_NAME);
    if(_fsiMyP>0) thickLeftAt.add(_fsiMyP);
    // Разделитель: мой прайс → первая колонка поставщика
    const _fsi=excelCols.findIndex(c=>!c.metaType&&c.fileName!==MY_PRICE_FILE_NAME);
    if(_fsi>0) thickLeftAt.add(_fsi);
    // Разделители между группами нал/бн/прочие у поставщиков
    for(let i=1;i<excelCols.length;i++){
        const p=excelCols[i-1],c=excelCols[i];
        if(!c.metaType&&c.fileName!==MY_PRICE_FILE_NAME&&!p.metaType&&p.fileName!==MY_PRICE_FILE_NAME)
            if(getColPayGroup(p)!==getColPayGroup(c)) thickLeftAt.add(i);
    }

    let dataToExport=[];
    if(mode==='myprice') dataToExport=groupedData.filter(item=>item.isInMyPrice).sort((a,b)=>a.myPriceOrder-b.myPriceOrder);
    else if(mode==='current') {
        dataToExport=getSortedData();
        // Apply delta filter if active
        if (window._deltaFilterActive && typeof window._deltaApplyToData === 'function') {
            dataToExport = window._deltaApplyToData(dataToExport);
        }
    }
    else dataToExport=groupedData;

    const workbook=new ExcelJS.Workbook();
    workbook.creator='Price Manager';
    const worksheet=workbook.addWorksheet('Сравнение');
    const totalCols=1+fileNames.length+nameFileOrder.length+excelCols.length;
    const fbS=2, fbE=1+fileNames.length, nsS=fbE+1, nsE=nsS+nameFileOrder.length-1;

    // ---- Единая палитра границ: тонкие чёрные внутри, жирные снаружи/шапка/разделители ----
    const _T = { style:'thin',   color:{argb:'FF000000'} }; // тонкая чёрная
    const _B = { style:'medium', color:{argb:'FF000000'} }; // жирная чёрная
    const _fntBase = { size:10, color:{argb:'FF000000'} };
    const _fntBold = { size:10, bold:true, color:{argb:'FF000000'} };
    const _fntRed  = { size:10, bold:true, color:{argb:'FFDC2626'} }; // красный для мин. цен

    // ---- Ширины колонок ----
    worksheet.getColumn(1).width = 16;                                             // штрихкод
    for(let _c=fbS; _c<=fbE; _c++) worksheet.getColumn(_c).width = 14;            // штрихкоды файлов
    for(let _c=nsS; _c<=nsE; _c++)
        worksheet.getColumn(_c).width = (hasMyPrice && _c===nsS) ? 52 : 22;       // наименования
    excelCols.forEach((col, _idx) => {
        worksheet.getColumn(priceStartColBase + _idx + 1).width =
            isPriceLikeColumn(col.columnName) ? 14 : 18;                          // цены шире 14
    });

    // ---- Шапка ----
    const headers=['Штрихкод'];
    fileNames.forEach(fn=>headers.push('Штрихкод\n('+truncateFileName(fn, 18)+')'));
    nameFileOrder.forEach(()=>headers.push('Наименование'));
    excelCols.forEach(col=>{
        if(!col.metaType && col.fileName!==MY_PRICE_FILE_NAME){
            headers.push(truncateFileName(col.fileName, 18)+'\n'+col.columnName);
        } else {
            headers.push(col.metaType ? col.displayName : col.columnName);
        }
    });

    const _xlH = worksheet.addRow(headers);
    _xlH.height = 36;
    // Стили шапки per-cell — гарантирует корректные границы
    for(let _ci=1; _ci<=totalCols; _ci++){
        const _eci = _ci - 1 - priceStartColBase;
        const _grpL = _ci===1 || (_eci>=0 && thickLeftAt.has(_eci));
        const _hc = _xlH.getCell(_ci);
        _hc.font      = _fntBold;
        _hc.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
        _hc.border    = {
            top:    _B,
            bottom: _B,
            left:   _grpL        ? _B : _T,
            right:  _ci===totalCols ? _B : _T
        };
    }
    if(fbS<=headers.length) _xlH.getCell(fbS).note='Штрихкоды по файлам';
    if(nsS<=headers.length) _xlH.getCell(nsS).note='Наименования по файлам';

    // ---- Строки данных ----
    const _xlTotalRows = dataToExport.length;
    dataToExport.forEach((item, _rowIdx) => {
        const _isLast = _rowIdx === _xlTotalRows - 1;
        const row=[item.barcode];
        fileNames.forEach(fn=>row.push(item.originalBarcodesByFile.get(fn)||''));
        nameFileOrder.forEach(fn=>row.push((item.namesByFile&&item.namesByFile.get(fn))||''));
        const priceStartCol=row.length;
        const numericColsInRow=[];
        const _eg={'нал':[],'бн':[],'other':[]};
        const _ei={'нал':[],'бн':[],'other':[]};
        const _egFiles={'нал':new Set(),'бн':new Set(),'other':new Set()};
        excelCols.forEach((col,idx)=>{
            const va=item.values.get(col.key); let cellValue='';
            if(va&&va.length>0){
                if(!col.metaType&&isPriceLikeColumn(col.columnName)){
                    const uniquePrices=[];
                    va.forEach(vObj=>{
                        const num=parseFloat(String(vObj.val).replace(/[^0-9.,]/g,'').replace(',','.'));
                        if(!isNaN(num)&&num>0){const r=roundPrice(num);if(!uniquePrices.includes(r))uniquePrices.push(r);}
                    });
                    if(uniquePrices.length===1){
                        cellValue=uniquePrices[0]; numericColsInRow.push(priceStartCol+idx);
                        if(col.fileName!==MY_PRICE_FILE_NAME){
                            const _g=getColPayGroup(col);
                            _eg[_g].push(uniquePrices[0]);
                            _ei[_g].push({ci:priceStartCol+idx,vi:_eg[_g].length-1});
                            _egFiles[_g].add(col.fileName);
                        }
                    } else if(uniquePrices.length>1){
                        cellValue=uniquePrices.map(p=>String(p).replace('.',',')).join(' / ');
                        if(col.fileName!==MY_PRICE_FILE_NAME){
                            const _g=getColPayGroup(col);
                            const cellMinIdx=_eg[_g].length;
                            uniquePrices.forEach(p=>{ _eg[_g].push(p); });
                            _ei[_g].push({ci:priceStartCol+idx,vi:cellMinIdx});
                            _egFiles[_g].add(col.fileName);
                        }
                    } else { cellValue=va[0]?.val||''; }
                } else if(col.metaType){
                    const num=parseFloat(String(va[0].val).replace(/[^0-9.,]/g,'').replace(',','.'));
                    cellValue=(!isNaN(num)&&num>=0)?num:(va[0].val??'');
                } else { cellValue=va[0]?.val||''; }
            }
            row.push(cellValue);
        });
        const excelRow=worksheet.addRow(row);
        excelRow.height=16;
        numericColsInRow.forEach(ci=>{
            const c=excelRow.getCell(ci+1);
            if(typeof c.value==='number') c.numFmt='#,##0.0';
        });

        // Красный жирный для минимальных цен
        const _minCells = new Set();
        if(showMinPriceMode){
            const _allNums=[];
            excelCols.forEach((col,idx)=>{
                if(col.metaType) return;
                const va=item.values.get(col.key);
                if(va) va.forEach(vObj=>{
                    const n=parseFloat(String(vObj.val).replace(/[^0-9.,]/g,'').replace(',','.'));
                    if(!isNaN(n)&&n>0) _allNums.push({n, ci:priceStartCol+idx});
                });
            });
            if(_allNums.length>0){
                const _absM=Math.min(..._allNums.map(x=>x.n));
                _allNums.filter(x=>x.n===_absM).forEach(({ci})=>_minCells.add(ci+1));
            }
        } else {
            ['нал','бн','other'].forEach(g=>{
                if(_eg[g].length>1&&_egFiles[g].size>1){
                    const mn=Math.min(..._eg[g]);
                    _ei[g].forEach(({ci,vi})=>{ if(_eg[g][vi]===mn) _minCells.add(ci+1); });
                }
            });
        }

        // Per-cell: шрифт, выравнивание, границы
        for(let _ci=1; _ci<=totalCols; _ci++){
            const _eci = _ci - 1 - priceStartColBase;
            const _grpL = _ci===1 || (_eci>=0 && thickLeftAt.has(_eci));
            const _cell = excelRow.getCell(_ci);
            _cell.font = _minCells.has(_ci) ? _fntRed : _fntBase;
            _cell.alignment = { vertical:'middle', horizontal:(_ci>priceStartColBase)?'right':'left' };
            _cell.border = {
                top:    _rowIdx === 0 ? _B : _T,   // жирная граница под шапкой у первой строки
                bottom: _isLast ? _B : _T,
                left:   _grpL           ? _B : _T,
                right:  _ci===totalCols ? _B : _T
            };
        }
    });

    // ---- Группировка скрытых колонок ----
    if(fileNames.length>0){worksheet.properties.outlineProperties={summaryBelow:true};for(let c=fbS;c<=fbE;c++){worksheet.getColumn(c).outlineLevel=1;worksheet.getColumn(c).hidden=true;}}
    if(nameFileOrder.length>1){worksheet.properties.outlineProperties={summaryBelow:true};const st=hasMyPrice?nsS+1:nsS;for(let c=st;c<=nsE;c++){worksheet.getColumn(c).outlineLevel=1;worksheet.getColumn(c).hidden=true;}}
    worksheet.views=[{state:'frozen',xSplit:0,ySplit:1}];

    const buffer=await workbook.xlsx.writeBuffer();
    const now=new Date(),yyyy=now.getFullYear(),mm=String(now.getMonth()+1).padStart(2,'0'),dd=String(now.getDate()).padStart(2,'0');
    let fileName=`monitoring-${yyyy}-${mm}-${dd}.xlsx`;
    if(mode==='myprice') fileName=`monitoring-myprice-${yyyy}-${mm}-${dd}.xlsx`;
    if(mode==='current') fileName=`monitoring-current-${yyyy}-${mm}-${dd}.xlsx`;
    const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    await saveBlobWithDialogOrDownload(blob,fileName);
    } catch(err) {
        alert('Ошибка при создании Excel-файла:\n' + (err.message || err));
    }
}

    function updateUI() {
        const hasData = groupedData.length > 0;
        const hasMyPrice = myPriceData !== null;
        exportAllBtn.disabled = !hasData;
        exportCurrentBtn.disabled = !hasData;
        exportMyPriceBtn.disabled = !hasMyPrice || !hasData;
        clearBtn.disabled = !hasData;
        bigDiffBtn.disabled = !hasData;
        showMyPriceBtn.disabled = !hasMyPrice || !hasData;
        compactMatchesBtn.disabled = !hasData;
        maxCoverageBtn.disabled = !hasData;
        if (minPriceBtn) minPriceBtn.disabled = !hasData;
        searchInput.disabled = !hasData;
        const _monArchBtn = document.getElementById('monitorDownloadArchiveBtn');
        if (_monArchBtn) _monArchBtn.disabled = !(window._obrArchiveFiles && window._obrArchiveFiles.length > 0);

        const _msBox = document.getElementById('monitorSearchBox');
        const _mES = document.getElementById('monitorEmptyState');
        if (_msBox) _msBox.style.display = hasData ? '' : 'none';
        if (_mES) _mES.style.display = hasData ? 'none' : '';

        const _infoPanel = document.getElementById('infoPanel');
        if (_infoPanel) _infoPanel.style.display = hasData ? '' : 'none';

        if (hasData) {
            const matchCount = groupedData.filter(item => item.originalFileCount > 1).length;
            const matchByBarcode = groupedData.filter(item => item.originalFileCount > 1 && !item.isSynonym).length;
            const matchByCross = groupedData.filter(item => item.originalFileCount > 1 && item.isSynonym).length;
            const noMatchCount = groupedData.filter(item => item.isInMyPrice && item.originalFileCount <= 1).length;
            const myPriceTotal = groupedData.filter(item => item.isInMyPrice).length;
            const coveragePct = myPriceTotal > 0 ? Math.round((myPriceTotal - noMatchCount) / myPriceTotal * 100) : (matchCount > 0 ? 100 : 0);
            const supplierPriceCols = allColumns.filter(c => !c.metaType && c.fileName !== MY_PRICE_FILE_NAME && (typeof isPriceLikeColumn === 'function' ? isPriceLikeColumn(c.columnName) : true)).length;
            document.getElementById('productCount').textContent = groupedData.length;
            document.getElementById('fileCount').textContent = competitorFilesData.length;
            document.getElementById('columnCount').textContent = supplierPriceCols || allColumns.filter(c => !c.metaType && c.fileName !== MY_PRICE_FILE_NAME).length;
            document.getElementById('matchCount').textContent = matchCount;
            document.getElementById('matchByBarcode').textContent = matchByBarcode;
            document.getElementById('matchByCross').textContent = matchByCross;
            document.getElementById('noMatchCount').textContent = noMatchCount || '—';
            document.getElementById('coveragePct').textContent = myPriceTotal > 0 ? coveragePct + '%' : '—';
            if (typeof matcherFileChipsRender === 'function') matcherFileChipsRender();
        } else {
            document.getElementById('productCount').textContent = '—';
            document.getElementById('fileCount').textContent = '—';
            document.getElementById('columnCount').textContent = '—';
            document.getElementById('matchCount').textContent = '—';
            document.getElementById('matchByBarcode').textContent = '—';
            document.getElementById('matchByCross').textContent = '—';
            document.getElementById('noMatchCount').textContent = '—';
            document.getElementById('coveragePct').textContent = '—';
            const _lp2=document.getElementById('legendPanel');if(_lp2)_lp2.style.display='none';
        }
    }

    function clearAll() {
        myPriceData = null;
        competitorFilesData = [];
        allFilesData = [];
        groupedData = [];
        allColumns = [];
        visibleColumns.clear();
        barcodeColumn = null;
        nameColumn = null;
        stockColumn = null;
        sortMode = 'default';
        compactMatches = true;
        searchQuery = '';
        showFileBarcodes = false;
        filterNewItems = false;
        showMinPriceMode = false;

        myPriceInput.value = '';
        competitorInput.value = '';
        synonymsInput.value = '';
        const _mpSt2=document.getElementById('myPriceStatus');if(_mpSt2){_mpSt2.className='upload-status upload-status--idle';_mpSt2.textContent='Не загружен';_mpSt2.style.display='';}
        const _cSt2=document.getElementById('competitorStatus');if(_cSt2){_cSt2.className='upload-status upload-status--idle';_cSt2.textContent='Не загружены';_cSt2.style.display='';}
        const _snSt2=document.getElementById('synonymsStatus');if(_snSt2){_snSt2.className='upload-status upload-status--idle';_snSt2.textContent='Не загружены';_snSt2.style.display='';}
        if (typeof _slotClearJsonChip === 'function') _slotClearJsonChip();
        if (typeof _slotClearMyPriceChip === 'function') _slotClearMyPriceChip();
        if (typeof _slotShowCompetitorStatus === 'function') _slotShowCompetitorStatus('Не загружены');
        const _supList=document.getElementById('monitorSupplierFileList');if(_supList){_supList.style.display='none';_supList.innerHTML='';}

        jeDB = {}; _jeDupsCache = null; jeChanges = 0;
        jeUndoStack = []; jeRedoStack = [];
        if (typeof jeUpdateUndoUI === 'function') jeUpdateUndoUI();
        if (typeof jeUpdateStatus === 'function') jeUpdateStatus();
        if (typeof jeRenderEditor === 'function') jeRenderEditor();
        if (typeof _brandDB !== 'undefined') { _brandDB = {}; }

        if (typeof brandRender === 'function') brandRender();
        if (typeof unifiedMarkUnsaved === 'function') unifiedMarkUnsaved(false);
        if (typeof _updatePriceCardsLock === 'function') _updatePriceCardsLock();
        resetBarcodeAliases();

        if (typeof rebuildBarcodeAliasFromJeDB === 'function') rebuildBarcodeAliasFromJeDB();
        searchInput.value = '';
        categoryFilter = '';
        const _catSel = document.getElementById('categoryFilterSelect');
        if (_catSel) { _catSel.value = ''; _catSel.style.background = 'var(--surface)'; _catSel.style.borderColor = 'var(--border-strong)'; _catSel.style.color = 'var(--text-primary)'; _catSel.style.fontWeight = ''; _catSel.innerHTML = '<option value="">Категории</option>'; }
        showMyPriceBtn.classList.remove('active');
        compactMatchesBtn.classList.add('active');
        maxCoverageBtn.classList.remove('active');
        if (minPriceBtn) minPriceBtn.classList.remove('active');

        tableContainer.innerHTML = _tableContainerInitialHTML;
        const _lp=document.getElementById('obr-loaded-files');
        if(_lp){_lp.style.display='none';}
        const _ll=document.getElementById('obr-loaded-list');
        if(_ll){_ll.innerHTML='';}
        if(typeof _sfUpdateMyPrice==='function')_sfUpdateMyPrice(null,null);
        if(typeof _sfUpdateSuppliers==='function')_sfUpdateSuppliers([]);
        if(typeof _sfUpdateJson==='function')_sfUpdateJson(null,null);
        updateUI();

        if (typeof _matchActivePairs !== 'undefined') _matchActivePairs = [];
        if (typeof _matchKnownPairs !== 'undefined') _matchKnownPairs = [];
        if (typeof _matchAllItems !== 'undefined') _matchAllItems = [];
        if (typeof _matchRenderedPairs !== 'undefined') _matchRenderedPairs = [];
        if (typeof _matchCurrentView !== 'undefined') _matchCurrentView = 'all';
        const _mWrap = document.getElementById('matcherTableWrap');
        if (_mWrap) { _mWrap.style.display = 'none'; if (_mWrap._mvsRender) _mWrap._mvsRender = null; }
        const _mEmpty = document.getElementById('matcherEmpty');
        if (_mEmpty) { _mEmpty.style.display = ''; }
        const _mTbody = document.getElementById('matcherTbody');
        if (_mTbody) _mTbody.innerHTML = '';
        const _mStats = document.getElementById('matcherStats');
        if (_mStats) { _mStats.style.display = 'none'; ['ms-all','ms-high','ms-mid'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0'; }); }
        const _mProg = document.getElementById('matcherProgress');
        if (_mProg) _mProg.style.display = 'none';
        const _mBtn = document.getElementById('matcherRunBtn');
        if (_mBtn) { _mBtn.disabled = false; _mBtn.textContent = '▶ Запустить поиск'; }
        const _mSearch = document.getElementById('matcherSearchInp');
        if (_mSearch) _mSearch.value = '';
        document.querySelectorAll('.mstat[data-mv]').forEach(s => s.classList.toggle('active', s.dataset.mv === 'all'));

        if (typeof _matcherDisabledFiles !== 'undefined') _matcherDisabledFiles = new Set();
        const _mfPanel = document.getElementById('matcherFilesPanel');
        if (_mfPanel) _mfPanel.style.display = 'none';
        const _mfChips = document.getElementById('matcherFileChips');
        if (_mfChips) _mfChips.innerHTML = '';
        const _mfJsonRow = document.getElementById('matcherJsonRow');
        if (_mfJsonRow) _mfJsonRow.style.display = 'none';

        // ── Архивные файлы (кнопка «Скачать архивом») ────────────────────────────
        if (typeof _obrArchiveFiles !== 'undefined') _obrArchiveFiles.length = 0;
        pendingCsvContent = null;
        const _archBtn  = document.getElementById('obrHeaderArchiveBtn');
        const _marchBtn = document.getElementById('monitorDownloadArchiveBtn');
        const _dlArchBtn = document.getElementById('obrDownloadArchiveBtn');
        if (_archBtn)   _archBtn.disabled   = true;
        if (_marchBtn)  _marchBtn.disabled  = true;
        if (_dlArchBtn) _dlArchBtn.disabled = true;

        // ── Очередь обработки файлов (вкладка «Загрузка прайсов») ────────────────
        const _qPanel = document.getElementById('obrQueuePanel');
        if (_qPanel) _qPanel.style.display = 'none';
        const _qStatus = document.getElementById('obrQueueStatus');
        if (_qStatus) { _qStatus.style.display = 'none'; _qStatus.textContent = ''; }
        const _qList = document.getElementById('obrQueueList');
        if (_qList) _qList.innerHTML = '';
        const _qCurrent = document.getElementById('obrQueueCurrent');
        if (_qCurrent) _qCurrent.textContent = '';
        const _qFill = document.getElementById('obrQueueProgressFill');
        if (_qFill) _qFill.style.width = '0%';
        const _showSkipped = document.getElementById('obrShowSkippedBtn');
        if (_showSkipped) _showSkipped.disabled = true;

        // ── Дельта-фильтр ─────────────────────────────────────────────────────────
        if (typeof resetDeltaFilter === 'function') resetDeltaFilter();
        else {
          window._deltaFilterActive = false;
          const _deltaBtn = document.getElementById('deltaFilterBtn');
          if (_deltaBtn) _deltaBtn.classList.remove('active', 'active-warn');
        }

        // ── Sticky-bar фильтров ───────────────────────────────────────────────────
        if (typeof window._updateStickyBar === 'function') window._updateStickyBar();

        // ── Сессия IndexedDB ──────────────────────────────────────────────────────
        if (typeof window._pmDB_clearSession === 'function') window._pmDB_clearSession();
        try { localStorage.removeItem('_pm_brandDB_session'); } catch(e) {}

        // ── Корзина ───────────────────────────────────────────────────────────────
        if (typeof window.clearCart === 'function') window.clearCart(true);
    }
    async function downloadCurrentSynonyms(){

      const combined = {
        barcodes: jeDB,
        brands: typeof _brandDB !== 'undefined' ? _brandDB : {},
        categoryWords: (typeof _catWordsBase !== 'undefined' && _catWordsBase.size > 0) ? [..._catWordsBase].sort() : undefined,
        columnSettings: (typeof columnTemplates !== 'undefined' && typeof columnSynonyms !== 'undefined') ? {
          templates: columnTemplates,
          synonyms: columnSynonyms
        } : undefined
      };
      const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' });
      const now = new Date();
      const fname = `settings_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.json`;
      await saveBlobWithDialogOrDownload(blob, fname);
      // Clear localStorage session — JSON has been downloaded with all current brands
      try { localStorage.removeItem('_pm_brandDB_session'); } catch(e) {}
      if (typeof unifiedMarkUnsaved === 'function') unifiedMarkUnsaved(false);
    }
    window.downloadCurrentSynonyms = downloadCurrentSynonyms;
    window.copyBarcode = copyBarcode;
    window.dividePrice = dividePrice;

    window._generateExcel = generateExcel;
    window._pmApp = {
      get myPriceData() { return myPriceData; },
      set myPriceData(v) { myPriceData = v; },
      get competitorFilesData() { return competitorFilesData; },
      set competitorFilesData(v) {
        competitorFilesData.length = 0;
        if (Array.isArray(v)) v.forEach(function(f) { competitorFilesData.push(f); });
      },
      addCompetitorFile(fd) {

        const dup = competitorFilesData.findIndex(f => f.fileName === fd.fileName);
        if (dup !== -1) {
          if (!confirm('Файл «' + fd.fileName + '» уже загружен в мониторинг.\nЗаменить его новой версией?')) return false;
          competitorFilesData.splice(dup, 1);
        }
        competitorFilesData.push(fd);
        return true;
      },
      parseFile,
      processAllData,
      removeFileExtension,
      renderTable,
      get myPriceInput() { return myPriceInput; },
      get competitorInput() { return competitorInput; },
      updateMyPriceStatus(name) {
        const el = document.getElementById('myPriceStatus');
        if (el) { el.className = 'upload-status upload-status--ok'; el.textContent = '✅ ' + name; }
        if (typeof window._sfUpdateMyPrice === 'function') window._sfUpdateMyPrice(name, myPriceData && myPriceData.data ? myPriceData.data.length : null);
      },
      updateCompetitorStatus() {
        const el = document.getElementById('competitorStatus');
        if (el) {
          const n = competitorFilesData.length;
          el.className = 'upload-status upload-status--ok';
          el.textContent = '✅ ' + n + ' файл' + (n===1?'':'а'+(n<5?'':'ов'));
        }
        if(typeof _sfUpdateSuppliers==='function')_sfUpdateSuppliers(competitorFilesData.map(f=>({name:f.fileName,rows:f.data?f.data.length:null})));
      }
    };

    window._pmAppOnMonitorShow = function() {
      if (groupedData.length > 0) {

        setTimeout(() => { renderTable(); }, 30);
      }
    };

    // ---- Тултип для ячеек наименования ----
    // Карточка: одна строка = один прайс: [значок прайса] [наименование] [штрихкод]
    (function() {
        var _tip = document.createElement('div');
        _tip.id = 'pmNameTip';
        _tip.style.cssText = [
            'display:none','position:fixed','z-index:10001',
            'max-width:520px','min-width:220px',
            'background:#fff','border:1px solid #E2E6EE',
            'border-radius:8px','box-shadow:0 6px 24px rgba(0,0,0,.13)',
            'font-size:12px','font-family:Inter,sans-serif',
            'padding:0','pointer-events:none','overflow:hidden'
        ].join(';');
        document.body.appendChild(_tip);

        var _timer = null, _lastTd = null;

        function _pos(x, y) {
            var tw = _tip.offsetWidth || 260, th = _tip.offsetHeight || 80;
            var vw = window.innerWidth, vh = window.innerHeight;
            var left = x + 18, top = y + 12;
            if (left + tw > vw - 8) left = x - tw - 18;
            if (left < 8) left = 8;
            if (top + th > vh - 8) top = y - th - 12;
            if (top < 8) top = 8;
            _tip.style.left = left + 'px';
            _tip.style.top  = top  + 'px';
        }

        function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
        function _trunc(s, n) { return s && s.length > n ? s.slice(0, n-1) + '\u2026' : (s||''); }

        function _build(td) {
            var raw = td.getAttribute('data-pm-names');
            if (!raw) return '';
            var rows;
            try { rows = JSON.parse(raw); } catch(e) { return ''; }
            if (!rows || !rows.length) return '';

            // Шапка
            var html = '<div style="background:#F0F4FF;border-bottom:1px solid #E2E6EE;padding:6px 12px 5px;font-size:10px;font-weight:700;color:#3B6FD4;letter-spacing:.04em;text-transform:uppercase;">Наименования по прайсам</div>';
            html += '<div style="padding:4px 0;">';

            rows.forEach(function(r, i) {
                var file    = _trunc(r.file || '', 28);
                var name    = _esc(r.name  || '');
                var barcode = _esc(r.barcode || '');
                var isOdd   = i % 2 === 1;
                var bg = isOdd ? 'background:#F8F9FC;' : '';
                html += '<div style="display:flex;align-items:baseline;gap:0;padding:4px 12px;' + bg + '">';
                // Колонка прайса
                html += '<span style="flex-shrink:0;width:130px;font-size:10px;color:#6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + _esc(r.file||'') + '">' + _esc(file) + '</span>';
                // Наименование
                html += '<span style="flex:1;font-size:12px;color:#1A1D23;font-weight:500;padding:0 8px;min-width:0;overflow-wrap:break-word;">' + name + '</span>';
                // Штрихкод
                if (barcode) {
                    html += '<span style="flex-shrink:0;font-size:10px;color:#9CA3AF;font-family:\'Courier New\',monospace;white-space:nowrap;padding-left:8px;">' + barcode + '</span>';
                }
                html += '</div>';
            });

            html += '</div>';
            return html;
        }

        document.addEventListener('mouseover', function(e) {
            var td = e.target.closest('#mainTableWrap td.col-name');
            if (!td || td === _lastTd) return;
            _lastTd = td;
            clearTimeout(_timer);
            _tip.style.display = 'none';
            _timer = setTimeout(function() {
                var html = _build(td);
                if (!html) return;
                _tip.innerHTML = html;
                _tip.style.display = 'block';
                _pos(e.clientX, e.clientY);
            }, 250);
        });

        document.addEventListener('mousemove', function(e) {
            if (_tip.style.display === 'none') return;
            if (!e.target.closest('#mainTableWrap td.col-name')) {
                _tip.style.display = 'none'; _lastTd = null; return;
            }
            _pos(e.clientX, e.clientY);
        });

        document.addEventListener('mouseout', function(e) {
            if (!e.target.closest || !e.target.closest('#mainTableWrap td.col-name')) return;
            clearTimeout(_timer);
            _tip.style.display = 'none'; _lastTd = null;
        });
    })();

    // Expose barcode lookup for cart "my price" feature
    window._pmLookupBarcode = function(bc) {
      if (!bc || !groupedData.length) return null;
      var bcStr = String(bc);
      return groupedData.find(function(row) { return row.barcode === bcStr; }) || null;
    };
    window._pmMyPriceName = function() {
      return typeof MY_PRICE_FILE_NAME !== 'undefined' ? MY_PRICE_FILE_NAME : 'Мой прайс';
    };
    // Expose shared helpers for matcher pane
    window._pmGetCategoryWords = _getCategoryWords;
    window._pmBuildCategoryDropdown = buildCategoryDropdown;

    function showCompletionToast() {

        if (window._pmRestoringSession) return;

        if (competitorFilesData.length === 0) return;
        const total = groupedData.length;
        const matched = groupedData.filter(i => i.isInMyPrice).length;
        const suppliers = competitorFilesData.length;
        if (total === 0) return;

        let toast = document.getElementById('_completionToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = '_completionToast';
            Object.assign(toast.style, {
                position: 'fixed', bottom: '24px', right: '24px',
                background: '#0f172a', color: '#f1f5f9',
                border: '1px solid #22c55e',
                padding: '14px 18px', borderRadius: '10px',
                fontSize: '13px', lineHeight: '1.6',
                boxShadow: '0 6px 28px rgba(0,0,0,.45)',
                zIndex: '99998', maxWidth: '340px',
                transition: 'opacity .4s, transform .4s',
                transform: 'translateY(20px)', opacity: '0',
                cursor: 'pointer'
            });
            toast.title = 'Перейти к мониторингу';
            toast.addEventListener('click', () => switchMainPane('monitor'));
            document.body.appendChild(toast);
        }
        toast.innerHTML =
            `<div style="font-size:15px;font-weight:700;color:var(--green);margin-bottom:6px;">✅ Мониторинг готов!</div>` +
            `<div>📦 Товаров: <b style="color:var(--accent)">${total.toLocaleString('ru')}</b></div>` +
            (matched ? `<div>🏷️ Совпало с прайсом: <b style="color:var(--accent)">${matched.toLocaleString('ru')}</b></div>` : '') +
            `<div>📂 Поставщиков: <b style="color:var(--accent)">${suppliers}</b></div>` +
            `<div style="margin-top:8px;font-size:11px;color:var(--text-muted);">Нажмите, чтобы открыть таблицу →</div>`;

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
        }, 4000);
    }


function switchMainPane(name) {
  const prev = document.querySelector('.main-pane.active');
  const prevId = prev ? prev.id : '';

  if (prevId === 'pane-prepare' && name !== 'prepare') {
    obrClearTable();
  }

  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.pane === name));
  document.querySelectorAll('.main-pane').forEach(p =>
    p.classList.toggle('active', p.id === 'pane-' + name));

  if (name === 'monitor' && typeof window._pmAppOnMonitorShow === 'function') {
    window._pmAppOnMonitorShow();
  }

  if (name === 'prepare') {
    setTimeout(function() {
      const _ab = document.getElementById('obrHeaderArchiveBtn');
      if (_ab && typeof _obrArchiveFiles !== 'undefined') _ab.disabled = !_obrArchiveFiles.length;
    }, 60);
  }

  if (name === 'matcher') {
    setTimeout(function() {
      const mWrap = document.getElementById('matcherTableWrap');
      if (mWrap && typeof mWrap._mvsRender === 'function') mWrap._mvsRender();
    }, 30);
  }
}

document.querySelectorAll('.nav-tab[data-pane]').forEach(t =>
  t.addEventListener('click', () => {
    const _sb = document.querySelector('.app-sidebar');
    if (_sb && _sb.classList.contains('collapsed')) {
      _sb.classList.remove('collapsed');
      localStorage.setItem('sidebarCollapsed', '0');
      const _tbtn = document.getElementById('sidebarToggle');
      if (_tbtn) _tbtn.title = 'Свернуть меню';
    }
    switchMainPane(t.dataset.pane);
  }));

const AppBridge = {
  _handlers: {},
  on(event, fn) { (this._handlers[event] = this._handlers[event] || []).push(fn); },
  emit(event, data) { (this._handlers[event] || []).forEach(fn => fn(data)); }
};

let obrCurrentType = 'supplier';
function obrSetType(type) {
  obrCurrentType = type;
  const badge = document.getElementById('obrTypeBadge');
  if (badge) {
    badge.textContent = type === 'myprice' ? 'Мой прайс' : 'Поставщик';
    badge.style.background = type === 'myprice' ? '#2d9a5f' : '#4a90d9';
    badge.style.display = '';
  }
}

(function() {
  const configEl = document.createElement('script');
  configEl.id = 'obrUserConfig';
  configEl.textContent = '{}';
  document.head.appendChild(configEl);
})();

function getUserConfig() {
  const el = document.getElementById("obrUserConfig");
  if (!el) return {};
  try { return JSON.parse(el.textContent || "{}"); } catch { return {}; }
}
function setUserConfig(cfg) {
  const el = document.getElementById("obrUserConfig");
  if (el) el.textContent = JSON.stringify(cfg, null, 2);
}

const DEFAULT_COLUMN_TEMPLATES = [
  "Штрихкод","EAN","Артикул","Наименование","Бренд","Категория",
  "Единица","Количество","Цена","Цена опт","Цена РРЦ","Сумма",
  "Остаток","В пути","Склад"
];
const DEFAULT_COLUMN_SYNONYMS = {
  "Штрихкод": ["штрихкод штука","штрих-код","штрихкод","barcode","gtin","шк","код товара"],
  "EAN":       ["ean13","ean","barcode","штрихкод"],
  "Артикул":   ["артикул поставщика","артикул","арт","art","sku","vendor code","code"],
  "Наименование": ["наименование товара","наименование товаров","номенклатура",
                   "наименование","название товара","название","name","товар","продукт"],
  "Бренд":     ["торговая марка","бренд","тм","марка","производитель","brand","trademark"],
  "Категория": ["подгруппа","категория","группа товаров","раздел","группа","тип","вид"],
  "Единица":   ["единица измерения","ед.изм","единица","упак","фасовка","тип упаковки","unit","ед"],
  "Количество":["количество в упаковке","количество","кол-во","кол","qty","count","шт"],
  "Цена":      ["входящая цена","закупочная цена","цена закупки","цена входящая",
                "входящая","закупочная","цена","price","стоимость","прайс"],
  "Цена опт":  ["оптовая цена","цена оптовая","оптовая","опт","wholesale","opt"],
  "Цена РРЦ":  ["рекомендованная розничная","рекомендуемая цена","розничная цена",
                "цена розничная","ррц","розничная","розница","retail","рц"],
  "Сумма":     ["итоговая сумма","сумма итого","итого","сумма","total","amount"],
  "Остаток":   ["свободный остаток","остаток на складе","остатки","наличие","остаток",
                "available","stock","доступно"],
  "В пути":    ["количество в пути","в пути","транзит","впути","transit","in transit"],
  "Склад":     ["место хранения","warehouse","склад","storage","хранение"]
};

function loadColumnTemplates() {
  const cfg = getUserConfig();
  if (Array.isArray(cfg.columnTemplates) && cfg.columnTemplates.length) return cfg.columnTemplates;
  try { const a = JSON.parse(localStorage.getItem("columnTemplates")||"[]"); if (a.length) return a; } catch {}
  return DEFAULT_COLUMN_TEMPLATES.slice();
}
function loadColumnSynonyms() {
  const cfg = getUserConfig();
  if (cfg.columnSynonyms && typeof cfg.columnSynonyms === "object") return cfg.columnSynonyms;
  try { const o = JSON.parse(localStorage.getItem("columnSynonyms")||"{}"); if (Object.keys(o).length) return o; } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_COLUMN_SYNONYMS));
}
function persistAll(markDirty = true) {
  const cfg = getUserConfig();
  cfg.columnTemplates = columnTemplates.slice();
  cfg.columnSynonyms = columnSynonyms;
  setUserConfig(cfg);
  localStorage.setItem("columnTemplates", JSON.stringify(columnTemplates));
  localStorage.setItem("columnSynonyms", JSON.stringify(columnSynonyms));

  if (markDirty && typeof unifiedMarkUnsaved === 'function') unifiedMarkUnsaved(true);
}

let columnTemplates = loadColumnTemplates();
let columnSynonyms  = loadColumnSynonyms();

let _columnSettingsFromFile = (() => {
  const cfg = getUserConfig();
  return !!(Array.isArray(cfg.columnTemplates) && cfg.columnTemplates.length
         && JSON.stringify(cfg.columnTemplates) !== JSON.stringify(DEFAULT_COLUMN_TEMPLATES));
})();
persistAll(false);

let tableData = null;
let selectedColumns = new Map();
let startRowIndex = 0;
let currentWorkbook = null;
let displayedRows = 50;
let activeDropdown = null;
let originalFileName = "export";
let fileQueue = [];
let _queueTotal = 0;

let _queueDone  = 0;

let pendingCsvContent = null;
let pendingCsvFileName = null;
let pendingSkippedRows = [];

let _obrArchiveFiles = [];

window._obrArchiveFiles = _obrArchiveFiles;

const fileInput      = document.getElementById("obrFileInput");
const fileInputMyPrice = document.getElementById("obrFileInputMyPrice");
const obrTableContainer = document.getElementById("obrTableContainer");
const dataTable      = document.getElementById("obrDataTable");
const downloadBtn    = document.getElementById("obrDownloadBtn");
const resetBtn       = document.getElementById("obrResetBtn");
const manageTemplatesBtn = document.getElementById("obrManageTemplatesBtn");
const fileNameDisplay = document.getElementById("obrFileNameDisplay");
const sheetSelector  = document.getElementById("obrSheetSelector");
const sheetSelect    = document.getElementById("obrSheetSelect");
const loadMoreBtn    = document.getElementById("obrLoadMoreBtn");
const loadMoreContainer = document.getElementById("obrLoadMoreContainer");
const downloadArchiveBtn = document.getElementById("obrDownloadArchiveBtn");
const templatesModal = document.getElementById("obrTemplatesModal");
const closeTemplatesModal = document.getElementById("obrCloseTemplatesModal");
const newTemplateInput = document.getElementById("obrNewTemplateInput");
const addTemplateBtn = document.getElementById("obrAddTemplateBtn");
const templatesList  = document.getElementById("obrTemplatesList");
const skippedModal   = document.getElementById("obrSkippedModal");
const closeSkippedModal = document.getElementById("obrCloseSkippedModal");
const skippedSummary = document.getElementById("obrSkippedSummary");
const skippedTable   = document.getElementById("obrSkippedTable");
const confirmDownloadCsvBtn = document.getElementById("obrConfirmDownloadCsvBtn");
const downloadSkippedBtn = document.getElementById("obrDownloadSkippedBtn");

document.addEventListener("click", function(e) {
  if (!e.target.closest("#pane-prepare .rename-wrapper") && !e.target.closest(".modal-box") && activeDropdown) {
    activeDropdown.classList.remove("show");
    activeDropdown = null;
  }
});

function renderQueuePanel() {
  const panel       = document.getElementById("obrQueuePanel");
  const queueList   = document.getElementById("obrQueueList");
  const queueCurrent= document.getElementById("obrQueueCurrent");
  const fillEl      = document.getElementById("obrQueueProgressFill");
  const labelEl     = document.getElementById("obrQueueProgressLabel");
  const statusEl    = document.getElementById("obrQueueStatus");

  if (statusEl) statusEl.style.display = "none";

  if (_queueTotal <= 1) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";

  if (queueCurrent) queueCurrent.textContent = originalFileName;

  const done    = _queueDone;
  const total   = _queueTotal;
  const pct     = Math.round((done / total) * 100);
  if (fillEl)  fillEl.style.width = Math.max(4, pct) + "%";
  if (labelEl) labelEl.textContent = `${done + 1} / ${total}`;

  if (queueList) {

    queueList.innerHTML = "";

    const activeChip = document.createElement("span");
    activeChip.className = "obr-queue-chip active";
    activeChip.textContent = originalFileName;
    activeChip.title = originalFileName;
    queueList.appendChild(activeChip);
    fileQueue.forEach((f, i) => {
      const chip = document.createElement("span");
      chip.className = "obr-queue-chip";
      chip.textContent = f.name.replace(/\.[^.]+$/, "");
      chip.title = f.name;
      queueList.appendChild(chip);
    });
  }
}

function loadFileObject(file) {
  originalFileName = (file.name || "export").replace(/\.[^.]+$/, "");
  fileNameDisplay.textContent = file.name || "";

  const tableWrap   = document.getElementById("obrTableWrap");
  const editArea = document.getElementById("obrEditArea");
  if (editArea) editArea.style.display = "";
  const _uHint = document.getElementById("obrUploadHint");
  if (_uHint) _uHint.style.display = "none";
  const _advBlock = document.getElementById("obrAdvantagesBlock");
  if (_advBlock) _advBlock.style.display = "none";

  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    try {
      currentWorkbook = XLSX.read(data, { type: "array" });
      if (currentWorkbook.SheetNames.length > 1) {
        sheetSelect.innerHTML = "";
        currentWorkbook.SheetNames.forEach((name, idx) => {
          const o = document.createElement("option");
          o.value = String(idx); o.textContent = name;
          sheetSelect.appendChild(o);
        });
        sheetSelector.style.display = "flex";
      } else {
        sheetSelector.style.display = "none";
      }
      loadSheet(0);
      renderQueuePanel();
    } catch(err) {
      if (typeof showToast === 'function') showToast('Ошибка чтения файла: ' + (err && err.message ? err.message : String(err)), 'err');
      loadNextFromQueue();
    }
  };
  reader.readAsArrayBuffer(file);
}

function loadNextFromQueue() {
  _queueDone++;
  if (fileQueue.length === 0) {

    tableData = null; selectedColumns.clear(); startRowIndex = 0; currentWorkbook = null;
    _queueTotal = 0; _queueDone = 0;
    document.getElementById("obrQueuePanel").style.display = "none";
    return;
  }
  const next = fileQueue.shift();
  selectedColumns.clear(); startRowIndex = 0; displayedRows = 50;
  loadFileObject(next);
}

function obrClearTable() {

  tableData        = null;
  currentWorkbook  = null;
  selectedColumns.clear();
  startRowIndex    = 0;
  displayedRows    = 50;
  fileQueue        = [];
  _queueTotal      = 0;
  _queueDone       = 0;

  if (dataTable) dataTable.innerHTML = "";
  const tableWrap = document.getElementById("obrTableWrap");
  if (tableWrap) tableWrap.style.display = "none";
  const editArea = document.getElementById("obrEditArea");
  if (editArea) editArea.style.display = "none";
  const _uHint2 = document.getElementById("obrUploadHint");
  if (_uHint2) _uHint2.style.display = "";
  const _advBlock2 = document.getElementById("obrAdvantagesBlock");
  if (_advBlock2) _advBlock2.style.display = "";
  const queuePanel = document.getElementById("obrQueuePanel");
  if (queuePanel) queuePanel.style.display = "none";
  const sheetSel = document.getElementById("obrSheetSelector");
  if (sheetSel) sheetSel.style.display = "none";
  const loadMoreEl = document.getElementById("obrLoadMoreContainer");
  if (loadMoreEl) loadMoreEl.style.display = "none";
  const fileNameEl = document.getElementById("obrFileNameDisplay");
  if (fileNameEl) fileNameEl.textContent = "";
  if (fileInput)       fileInput.value       = "";
  if (fileInputMyPrice) fileInputMyPrice.value = "";

  if (typeof updateStats === 'function') updateStats();
}

fileInput.addEventListener("change", function(e) { handleFileUpload(e); });
if (fileInputMyPrice) fileInputMyPrice.addEventListener("change", function(e) {
  obrSetType('myprice');
  handleFileUpload(e);
});

// ── Проверка: загружен ли файл памяти ────────────────────────────────────
function _isJsonLoaded() {
  return (typeof jeDB !== 'undefined' && Object.keys(jeDB).length > 0)
      || (typeof _brandDB !== 'undefined' && Object.keys(_brandDB).length > 0);
}

// ── Блокировка/разблокировка карточек загрузки прайсов ───────────────────
function _updatePriceCardsLock() {
  var locked = !_isJsonLoaded();
  var ids = ['obrClearedFileInput', 'obrClearedFileInputMyPrice'];
  var cards = ['obrHeaderMyPriceCard', 'obrHeaderSupplierCard'];
  var hintId = '_priceCardsHint';

  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.disabled = locked;
  });
  cards.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (locked) {
      el.style.opacity = '0.45';
      el.style.pointerEvents = 'none';
      el.title = 'Сначала загрузите файл памяти';
    } else {
      el.style.opacity = '';
      el.style.pointerEvents = '';
      el.title = id === 'obrHeaderMyPriceCard'
        ? 'Загрузить свой основной прайс-лист'
        : 'Загрузить один или несколько файлов поставщика';
    }
  });

  // Подсказка под кнопками
  var hint = document.getElementById(hintId);
  if (hint) hint.style.display = locked ? '' : 'none';
}

function _handleJsonFileUpload(file, afterLoad) {
  if (!file) return;
  // Если файл памяти уже загружен — спросить перед перезаписью
  if (_isJsonLoaded()) {
    jeConfirmDialog(
      'Файл памяти уже загружен. Заменить его файлом «' + file.name + '»?\nВсе текущие данные (кросскоды, бренды, настройки) будут перезаписаны.',
      '🔄 Замена файла памяти'
    ).then(function(ok) {
      if (!ok) return;
      _doLoadJsonFile(file, afterLoad);
    });
    return;
  }
  _doLoadJsonFile(file, afterLoad);
}

function _doLoadJsonFile(file, afterLoad) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const json = JSON.parse(ev.target.result);
      // Используем централизованную функцию — она обновляет ВСЕ параметры из JSON
      if (typeof applyJsonToState === 'function') {
        applyJsonToState(json, file.name);
      } else {
        // Fallback: прямой trigger (старый путь)
        AppBridge.emit('settingsLoaded', json);
        const synInp = document.getElementById('synonymsInput');
        if (synInp) {
          const dt = new DataTransfer();
          dt.items.add(file);
          synInp.files = dt.files;
          synInp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (typeof afterLoad === 'function') afterLoad();
      if (typeof _updatePriceCardsLock === 'function') _updatePriceCardsLock();
    } catch(err) { showToast('Ошибка чтения JSON: ' + err.message, 'err'); }
  };
  reader.readAsText(file, 'utf-8');
}

const obrJsonUploadInput = document.getElementById("obrJsonUploadInput");
if (obrJsonUploadInput) obrJsonUploadInput.addEventListener("change", function(e) {
  const file = e.target.files[0]; if (!file) return;
  _handleJsonFileUpload(file, function(){ setTimeout(function(){if(typeof obrShowNextStep==='function')obrShowNextStep('json');},400); });
  e.target.value = "";
});

const brandLoadJsonFileIn = document.getElementById("brandLoadJsonFileIn");
if (brandLoadJsonFileIn) brandLoadJsonFileIn.addEventListener("change", function(e) {
  const file = e.target.files[0]; if (!file) return;
  _handleJsonFileUpload(file, function(){ showToast('Файл памяти загружен', 'ok'); });
  e.target.value = "";
});

const bcLoadJsonFileIn = document.getElementById("bcLoadJsonFileIn");
if (bcLoadJsonFileIn) bcLoadJsonFileIn.addEventListener("change", function(e) {
  const file = e.target.files[0]; if (!file) return;
  _handleJsonFileUpload(file, function(){ showToast('Файл памяти загружен', 'ok'); });
  e.target.value = "";
});

const obrClearedFileInput = document.getElementById("obrClearedFileInput");
const obrClearedFileInputMyPrice = document.getElementById("obrClearedFileInputMyPrice");
if (obrClearedFileInput) obrClearedFileInput.addEventListener("change", function(e) {
  const tableWrap = document.getElementById("obrTableWrap");
  if (tableWrap) tableWrap.style.display = "";
  obrSetType('supplier');
  handleFileUpload(e);
});
if (obrClearedFileInputMyPrice) obrClearedFileInputMyPrice.addEventListener("change", function(e) {
  const tableWrap = document.getElementById("obrTableWrap");
  if (tableWrap) tableWrap.style.display = "";
  obrSetType('myprice');
  handleFileUpload(e);
});

const obrClearedJsonInput = document.getElementById("obrClearedJsonInput");
if (obrClearedJsonInput) obrClearedJsonInput.addEventListener("change", function(e) {
  const file = e.target.files[0]; if (!file) return;
  _handleJsonFileUpload(file, function(){ setTimeout(function(){if(typeof obrShowNextStep==='function')obrShowNextStep('json');},400); });
  e.target.value = "";
});

document.addEventListener('DOMContentLoaded', function() {
  var resetAllCard = document.getElementById('obrHeaderResetAllBtn');
  var confirmModal = document.getElementById('confirmClearModal');
  var btnOk = document.getElementById('confirmClearOk');
  if (!resetAllCard || !confirmModal || !btnOk) return;

  resetAllCard.addEventListener('click', function() {
    confirmModal.style.display = 'flex';
  });

  btnOk.addEventListener('click', function() {
    if (typeof obrClearTable === 'function') obrClearTable();
  });
});

const obrQueueSkipBtn = document.getElementById("obrQueueSkipBtn");
if (obrQueueSkipBtn) {
  obrQueueSkipBtn.addEventListener("click", function() {
    if (fileQueue.length === 0) return;
    showToast(`⏭ Файл «${originalFileName}» пропущен`, 'warn');
    loadNextFromQueue();
  });
}

if (downloadArchiveBtn) {
  downloadArchiveBtn.addEventListener("click", async function() {
    if (!_obrArchiveFiles.length) { showToast('Нет обработанных файлов для архива', 'warn'); return; }
    try {
      const zip = new JSZip();
      _obrArchiveFiles.forEach(function(f) {
        zip.file(f.fileName, f.csvText);
      });

      try {
        if (typeof jeDB !== 'undefined' || typeof _brandDB !== 'undefined') {
          const combined = {
            barcodes: (typeof jeDB !== 'undefined') ? jeDB : {},
            brands: (typeof _brandDB !== 'undefined') ? _brandDB : {},
            categoryWords: (typeof _catWordsBase !== 'undefined' && _catWordsBase.size > 0) ? [..._catWordsBase].sort() : undefined,
            columnSettings: (typeof columnTemplates !== 'undefined' && typeof columnSynonyms !== 'undefined') ? {
              templates: columnTemplates, synonyms: columnSynonyms
            } : undefined
          };
          const hasData = Object.keys(combined.barcodes).length > 0 || Object.keys(combined.brands).length > 0;
          if (hasData) {
            const now2 = new Date();
            const stamp2 = now2.getFullYear() + '_' + String(now2.getMonth()+1).padStart(2,'0') + '_' + String(now2.getDate()).padStart(2,'0');
            zip.file('settings_' + stamp2 + '.json', JSON.stringify(combined, null, 2));
          }
        }
      } catch(je) {   }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const now = new Date();
      const stamp = now.getFullYear() + '_' +
        String(now.getMonth()+1).padStart(2,'0') + '_' +
        String(now.getDate()).padStart(2,'0');
      saveAs(blob, 'price_export_' + stamp + '.zip');
      showToast(`✅ Архив скачан: ${_obrArchiveFiles.length} файл${_obrArchiveFiles.length===1?'':'а'}`, 'ok');
    } catch(err) {
      showToast('Ошибка создания архива: ' + (err.message||String(err)), 'err');
    }
  });
}

function handleFileUpload(e) {
  const files = e.target.files;
  if (!files || !files.length) return;
  const arr = Array.from(files);

  _queueDone  = 0;
  _queueTotal = arr.length;
  if (arr.length === 1) {
    fileQueue = [];
    loadFileObject(arr[0]);
  } else {
    fileQueue = arr.slice(1);
    loadFileObject(arr[0]);
  }
  e.target.value = "";
}

sheetSelect.addEventListener("change", function() {
  loadSheet(parseInt(sheetSelect.value, 10) || 0);
});

function obrAutoDetectColumns() {
  if (!tableData || !tableData.length) return;
  const SCAN = 15;
  const maxCols = Math.max(0, ...tableData.map(r => r ? r.length : 0));
  for (let col = 0; col < maxCols; col++) {
    if (selectedColumns.has(col)) continue;
    for (let row = 0; row < Math.min(SCAN, tableData.length); row++) {
      const cell = (tableData[row] || [])[col];
      if (cell == null) continue;
      const norm = String(cell).toLowerCase().replace(/\s+/g, " ").trim();
      if (!norm) continue;
      let matched = false;
      for (const tpl of columnTemplates) {
        for (const syn of (columnSynonyms[tpl] || []).filter(Boolean)) {
          if (norm === syn.toLowerCase().replace(/\s+/g, " ").trim()) {
            selectedColumns.set(col, tpl); matched = true; break;
          }
        }
        if (matched) break;
      }
      if (matched) break;
    }
  }
}

function loadSheet(idx) {
  if (!currentWorkbook) return;
  const ws = currentWorkbook.Sheets[currentWorkbook.SheetNames[idx]];
  currentWs = ws;
  tableData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  startRowIndex = 0; selectedColumns.clear(); displayedRows = Math.min(50, tableData.length);
  obrAutoDetectColumns(); obrRenderTable(); updateLoadMore();

}

function obrEsc(t) {
  return String(t).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function applyColWidths() {
  const MAX_W = 150;
  const PAD   = 18;

  if (!tableData || !tableData.length) return;
  const maxCols = Math.max(0, ...tableData.map(r => r ? r.length : 0));
  const rowsToSample = Math.min(tableData.length, 60);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = '13px Inter, sans-serif';
  const ctxH = document.createElement('canvas').getContext('2d');
  ctxH.font = 'bold 12px Inter, sans-serif';

  const widths = new Array(maxCols).fill(0);

  for (let i = 0; i < maxCols; i++) {
    widths[i] = Math.max(widths[i], ctxH.measureText(String(i + 1)).width + PAD + 24);
  }

  for (let ri = 0; ri < rowsToSample; ri++) {
    const row = tableData[ri] || [];
    for (let ci = 0; ci < maxCols; ci++) {
      const v = row[ci] != null ? String(row[ci]) : '';
      const w = ctx.measureText(v).width + PAD;
      if (w > widths[ci]) widths[ci] = w;
    }
  }

  const table = dataTable.closest('table');
  if (!table) return;
  let old = table.querySelector('colgroup');
  if (old) old.remove();
  const cg = document.createElement('colgroup');

  const cNum = document.createElement('col');
  cNum.style.minWidth = '36px';
  cNum.style.width = '36px';
  cg.appendChild(cNum);
  for (let i = 0; i < maxCols; i++) {
    const c = document.createElement('col');
    const w = Math.min(Math.ceil(widths[i]), MAX_W);
    c.style.minWidth = w + 'px';
    cg.appendChild(c);
  }
  table.insertBefore(cg, table.firstChild);
}

function obrRenderTable() {

  const _tw = document.getElementById('obrTableWrap');
  if (_tw) _tw.style.display = '';
  if (!tableData || !tableData.length) { dataTable.innerHTML = "<tr><td>Нет данных</td></tr>"; updateStats(); return; }
  const maxCols = Math.max(0, ...tableData.map(r => r ? r.length : 0));
  const rowsToShow = Math.min(displayedRows, tableData.length);

  let html = "<thead><tr>";
  html += `<th class="xl-row-num" title="">#</th>`;
  for (let i = 0; i < maxCols; i++) {
    const sel = selectedColumns.has(i);
    const colName = sel ? selectedColumns.get(i) : '';
    html += `<th class="${sel ? "col-selected" : ""}" data-col="${i}" style="white-space:nowrap;min-width:${sel?'160px':'40px'};">`;
    if (sel) {
      html += `<div style="display:flex;flex-direction:column;gap:3px;padding:3px 0 0;">`;
      html += `<div style="font-size:9px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:1px;">Колонка ${i+1}</div>`;
      html += createRenameInput(i, colName);
      html += `</div>`;
    } else {
      html += `<div style="padding:4px 2px;display:flex;flex-direction:column;align-items:center;gap:2px;">`;
      html += `<span style="font-size:11px;font-weight:700;color:var(--text-primary);">${i+1}</span>`;
      html += `</div>`;
    }
    html += "</th>";
  }
  html += "</tr></thead><tbody>";

  for (let ri = 0; ri < rowsToShow; ri++) {
    const row = tableData[ri] || [];
    const hidden = ri < startRowIndex;
    html += `<tr class="${hidden ? "row-hidden" : ""}" data-row-index="${ri}">`;
    html += `<td class="xl-row-num">${ri + 1}</td>`;
    for (let i = 0; i < maxCols; i++) {
      const v = row[i] != null ? row[i] : "";
      const selClass = selectedColumns.has(i) ? ' style="background:#ebf7ed;"' : '';
      html += `<td data-row="${ri}" data-col="${i}"${selClass}>${obrEsc(v)}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody>";
  dataTable.innerHTML = html;
  applyColWidths();
  attachEvents();
  updateStats();
}

function createRenameInput(colIndex, value) {
  const ev = String(value || "").replaceAll('"', "&quot;");
  const items = columnTemplates.filter(Boolean).map(t =>
    `<div class="dropdown-item" data-value="${String(t).replaceAll('"','&quot;')}">${obrEsc(t)}</div>`
  ).join("");
  return `<div class="rename-wrapper" data-col="${colIndex}">
    <input class="rename-input" type="text" value="${ev}" data-col="${colIndex}" placeholder="Название колонки">
    <div class="dropdown" data-col="${colIndex}">${items}</div>
  </div>`;
}

function openDropdown(colIndex, doFocus) {
  const input = document.querySelector(`#pane-prepare .rename-input[data-col="${colIndex}"]`);
  const dd = document.querySelector(`#pane-prepare .dropdown[data-col="${colIndex}"]`);
  if (!input || !dd) return;
  if (activeDropdown && activeDropdown !== dd) activeDropdown.classList.remove("show");
  dd.classList.add("show"); activeDropdown = dd;
  if (doFocus) { input.focus(); input.select(); }
}

function attachEvents() {
  document.querySelectorAll("#pane-prepare th[data-col]").forEach(th => {
    th.addEventListener("click", function(e) {
      if (e.target.closest(".rename-wrapper")) return;
      const ci = parseInt(th.dataset.col, 10);
      if (selectedColumns.has(ci)) { selectedColumns.delete(ci); obrRenderTable(); return; }
      selectedColumns.set(ci, ""); obrRenderTable();
      requestAnimationFrame(() => openDropdown(ci, true));
    });
  });
  document.querySelectorAll("#pane-prepare .rename-input").forEach(inp => {
    inp.addEventListener("click", e => { e.stopPropagation(); openDropdown(parseInt(inp.dataset.col,10), false); });
    inp.addEventListener("input", e => { selectedColumns.set(parseInt(inp.dataset.col,10), inp.value); updateStats(); });
    inp.addEventListener("focus", e => e.target.select());
  });
  document.querySelectorAll("#pane-prepare .dropdown-item").forEach(item => {
    item.addEventListener("click", e => {
      e.stopPropagation();
      const dd = e.target.closest(".dropdown");
      const ci = parseInt(dd.dataset.col, 10);
      const inp = document.querySelector(`#pane-prepare .rename-input[data-col="${ci}"]`);
      if (!inp) return;
      inp.value = e.target.dataset.value || "";
      selectedColumns.set(ci, inp.value);
      dd.classList.remove("show"); activeDropdown = null; updateStats();
    });
  });

}

function updateLoadMore() {
  const rem = (tableData ? tableData.length : 0) - displayedRows;
  loadMoreContainer.style.display = rem > 0 ? "block" : "none";
  if (rem > 0) document.getElementById("obrRemainingRows").textContent = String(rem);
}

loadMoreBtn.addEventListener("click", function() {
  displayedRows = tableData ? tableData.length : displayedRows;
  obrRenderTable(); updateLoadMore();
});

function updateStats() {
  const maxCols = tableData && tableData.length ? Math.max(0, ...tableData.map(r => r ? r.length : 0)) : 0;
  document.getElementById("obrTotalColumns").textContent  = String(maxCols);
  document.getElementById("obrSelectedColumns").textContent = String(selectedColumns.size);
  document.getElementById("obrTotalRows").textContent = String(Math.max(0, (tableData ? tableData.length : 0) - startRowIndex));
  downloadBtn.disabled = selectedColumns.size === 0;
  if (typeof _obrUpdateSkippedBtn === 'function') _obrUpdateSkippedBtn();
}

function esc_csv(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r"))
    return `"${s.replaceAll('"', '""')}"`;
  return s;
}
function normHeader(n) {
  return String(n||"").toLowerCase().trim().replaceAll("ё","е").replaceAll(/\s+/g," ").replaceAll(/[^\p{L}\p{N} ]/gu,"");
}
function normalizeBarcode(raw) {
  let s = String(raw ?? "").trim().replace(/\s+/g, "");
  while (s.endsWith(".")) s = s.slice(0,-1);
  if (/^\d+$/.test(s)) return s;
  if (/^\d+\.0$/.test(s)) return s.split(".0")[0];
  const m = s.replace(",",".").match(/^(\d+)(?:\.(\d+))?e\+?(\d+)$/i);
  if (!m) return "";
  const digits = m[1]+(m[2]||""), exp = parseInt(m[3],10), shift = exp-(m[2]||"").length;
  if (shift >= 0) return digits + "0".repeat(shift);
  const cut = digits.length + shift;
  if (cut <= 0 || !/^0+$/.test(digits.slice(cut))) return "";
  return digits.slice(0, cut);
}
function findBarcodeCol(indices) {
  for (const ci of indices) {
    const n = normHeader(selectedColumns.get(ci)||"");
    if (/штрихкод/.test(n) || /barcode/.test(n) || /\bean\b/.test(n)) return ci;
  }
  return -1;
}

function buildCsvAndSkipped() {
  if (!selectedColumns.size) return { ok: false, error: "Выберите колонки." };
  const indices = Array.from(selectedColumns.keys()).sort((a,b)=>a-b);
  const bcCol = findBarcodeCol(indices);
  if (bcCol === -1) return { ok: false, error: "Не найдена колонка штрихкода (название должно содержать «штрихкод» / barcode / ean)." };

  // Find name column index for duplicate-barcode suffix
  const nameColIdx = (function() {
    for (const ci of indices) {
      const n = normHeader(selectedColumns.get(ci) || "");
      if (/наименование|название|name|товар|product/.test(n)) return ci;
    }
    return -1;
  })();

  let csv = "\uFEFF" + indices.map(i => esc_csv(selectedColumns.get(i)||"")).join(",") + "\n";
  const skipped = [];

  // Pre-scan to count barcode occurrences for index suffix
  const barcodeCount = new Map();
  for (let ri = startRowIndex; ri < tableData.length; ri++) {
    const row = tableData[ri] || [];
    const normBC = normalizeBarcode(row[bcCol]);
    if (normBC && /^\d+$/.test(normBC)) {
      barcodeCount.set(normBC, (barcodeCount.get(normBC) || 0) + 1);
    }
  }
  const barcodeSeenIdx = new Map();

  for (let ri = startRowIndex; ri < tableData.length; ri++) {
    const row = tableData[ri] || [];

    const rawBC = row[bcCol];
    const rawBCS = rawBC == null ? "" : String(rawBC);
    const normBC = normalizeBarcode(rawBC);
    if (!normBC || !/^\d+$/.test(normBC)) {
      skipped.push({ rowIndex: ri, rowNumber: ri+1, rawBarcode: rawBCS, normalizedBarcode: normBC||"", reason: !rawBCS.trim() ? "Пустой штрихкод" : "Некорректный штрихкод" });
      continue;
    }

    // Track occurrence index for this barcode
    const seenIdx = (barcodeSeenIdx.get(normBC) || 0) + 1;
    barcodeSeenIdx.set(normBC, seenIdx);
    const isDup = barcodeCount.get(normBC) > 1;

    const vals = indices.map(ci => {
      if (ci === bcCol) return normBC;
      let v = row[ci] != null ? String(row[ci]).trim() : "";

      // Append index suffix to name when barcode appears more than once
      if (isDup && ci === nameColIdx && v !== "") {
        v = v + " (" + seenIdx + ")";
      }

      const colName = (selectedColumns.get(ci) || "").toLowerCase();
      const isStockCol = STOCK_COL_SYNONYMS.some(s => colName.includes(s));
      if (isStockCol && v !== "") {
        const parsed = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(parsed)) return String(Math.floor(parsed));
      }
      if (/^\d+,\d{2}$/.test(v)) v = v.replace(",", ".");
      return v;
    });
    if (vals.every(v => !v)) continue;
    csv += vals.map(esc_csv).join(",") + "\n";
  }
  return { ok: true, csvContent: csv, skipped };
}

function openSkippedModal(skipped, fn) {
  pendingSkippedRows = skipped.slice();
  pendingCsvFileName = fn;
  const preview = skipped.filter(s => s.reason !== "Пустой штрихкод");
  const hidden = skipped.length - preview.length;
  const toShow = preview.slice(0, 500);
  skippedSummary.textContent = `Всего пропусков: ${skipped.length}. Пустых скрыто: ${hidden}. Показано: ${toShow.length}${preview.length>500?" (из "+preview.length+")":""}.`;
  let h = "<thead><tr><th style='min-width:80px'>Строка</th><th style='min-width:220px'>Штрихкод в файле</th><th style='min-width:220px'>Нормализованный</th><th style='min-width:220px'>Причина</th></tr></thead><tbody>";
  toShow.forEach(s => { h += `<tr><td>${obrEsc(s.rowNumber)}</td><td>${obrEsc(s.rawBarcode)}</td><td>${obrEsc(s.normalizedBarcode)}</td><td>${obrEsc(s.reason)}</td></tr>`; });
  h += "</tbody>";
  skippedTable.innerHTML = h;
  skippedModal.style.display = "flex";
}
function hideSkippedModal() { skippedModal.style.display = "none"; }
closeSkippedModal.addEventListener("click", hideSkippedModal);
skippedModal.addEventListener("click", e => { if (e.target === skippedModal) hideSkippedModal(); });

confirmDownloadCsvBtn.addEventListener("click", async function() {
  if (!pendingCsvContent) return;
  const fn = pendingCsvFileName || originalFileName+".csv";
  hideSkippedModal();
  const savedType = obrCurrentType;
  AppBridge.emit('csvReady', { csvText: pendingCsvContent, fileName: fn, isMyPrice: savedType === 'myprice' });
  _obrArchiveFiles.push({ fileName: fn, csvText: pendingCsvContent });
  if (downloadArchiveBtn) downloadArchiveBtn.disabled = false;
  const _hdrAct2 = document.getElementById('obrHeaderArchiveBtn'); if (_hdrAct2) _hdrAct2.disabled = false;
  if (fileQueue.length) {
    showToast(`✅ «${originalFileName}» сохранён → открывается следующий (${_queueDone + 2}/${_queueTotal})…`, 'ok');
    setTimeout(loadNextFromQueue, 400);
  } else {
    setTimeout(() => obrShowNextStep(savedType), 400);
  }
});
downloadSkippedBtn.addEventListener("click", function() {
  if (!pendingSkippedRows || !pendingSkippedRows.length) { alert("Нет пропусков."); return; }

  const allRows = pendingSkippedRows;
  let h = "<thead><tr><th style='min-width:80px'>Строка</th><th style='min-width:220px'>Штрихкод в файле</th><th style='min-width:220px'>Нормализованный</th><th style='min-width:220px'>Причина</th></tr></thead><tbody>";
  allRows.forEach(s => { h += `<tr><td>${obrEsc(s.rowNumber)}</td><td>${obrEsc(s.rawBarcode)}</td><td>${obrEsc(s.normalizedBarcode)}</td><td>${obrEsc(s.reason)}</td></tr>`; });
  h += "</tbody>";
  skippedTable.innerHTML = h;
  skippedSummary.textContent = `Показаны все пропуски: ${allRows.length}`;
});

let _lastSkippedRows = [];

downloadBtn.addEventListener("click", async function() {
  const res = buildCsvAndSkipped();
  if (!res.ok) { showToast(res.error, 'err'); return; }

  pendingCsvContent = res.csvContent;
  pendingCsvFileName = originalFileName + ".csv";
  _lastSkippedRows = res.skipped || [];
  _obrUpdateSkippedBtn();

  const fn = originalFileName + ".csv";
  const savedType = obrCurrentType;

  AppBridge.emit('csvReady', { csvText: res.csvContent, fileName: fn, isMyPrice: savedType === 'myprice' });

  _obrArchiveFiles.push({ fileName: fn, csvText: res.csvContent });
  if (downloadArchiveBtn) downloadArchiveBtn.disabled = false;
  const _hdrActB = document.getElementById('obrHeaderArchiveBtn'); if (_hdrActB) _hdrActB.disabled = false;

  const skippedMeaningful = _lastSkippedRows.filter(s => s.reason !== "Пустой штрихкод");

  if (fileQueue.length) {
    const remaining = fileQueue.length;
    if (skippedMeaningful.length) {
      showToast(`✅ «${originalFileName}» передан. Пропусков: ${skippedMeaningful.length}. Открывается следующий файл (${_queueDone + 2}/${_queueTotal})…`, 'warn');
    } else {
      showToast(`✅ «${originalFileName}» передан → открывается следующий (${_queueDone + 2}/${_queueTotal})…`, 'ok');
    }
    setTimeout(loadNextFromQueue, 400);
  } else {
    if (skippedMeaningful.length) {
      showToast('✅ Данные переданы в мониторинг. Пропущено строк: ' + skippedMeaningful.length + ' — нажмите «Проверить пропущенные строки».', 'warn');
    } else {
      const batchMsg = _queueTotal > 1 ? ` Все ${_queueTotal} файла обработаны!` : '';
      showToast('✅ Данные переданы в мониторинг!' + batchMsg, 'ok');
    }
    setTimeout(() => obrShowNextStep(savedType), 400);
  }
});

const obrShowSkippedBtn = document.getElementById('obrShowSkippedBtn');
function _obrUpdateSkippedBtn() {
  if (!obrShowSkippedBtn) return;

  obrShowSkippedBtn.disabled = !selectedColumns.size;
}
if (obrShowSkippedBtn) {
  obrShowSkippedBtn.addEventListener('click', function() {
    if (!selectedColumns.size) return;

    const res = buildCsvAndSkipped();
    if (!res.ok) { showToast(res.error, 'err'); return; }
    const rows = res.skipped || [];
    if (!rows.length) { showToast('Пропущенных строк нет — все штрихкоды корректны ✅', 'ok'); return; }
    openSkippedModal(rows, (pendingCsvFileName || (originalFileName || 'файл') + '.csv'));
  });
}

function obrShowNextStep(savedType) {
  const modal = document.getElementById('obrNextStepModal');
  const title = document.getElementById('obrNextStepTitle');
  const sub   = document.getElementById('obrNextStepSub');
  const btns  = document.getElementById('obrNextStepBtns');

  const jsonAlreadyLoaded = !!_columnSettingsFromFile
    || (typeof jeDB !== 'undefined' && Object.keys(jeDB).length > 0)
    || (document.getElementById('sfJsonName') && document.getElementById('sfJsonName').textContent !== 'JSON не загружен');
  const myPriceAlreadyLoaded = !!(window._pmApp && window._pmApp.myPriceData);
  const suppliersAlreadyLoaded = !!(window._pmApp && window._pmApp.competitorFilesData && window._pmApp.competitorFilesData.length > 0);

  if (savedType === 'json') {
    title.textContent = '✅ JSON загружен!';
    sub.textContent = 'Настройки колонок и кросскоды применены. Теперь откройте прайс.';
  } else {
    title.textContent = '✅ Файл сохранён!';
    sub.textContent = 'Что делаем дальше?';
  }

  const rows = [];

  if (!jsonAlreadyLoaded && savedType !== 'json') {
    rows.push({
      cls: 'btn-json', icon: '📋',
      label: 'Загрузить JSON',
      hint: 'Применит настройки столбцов и базу кросскодов',
      action: () => { obrCloseNextStep(); setTimeout(() => { const j = document.getElementById('obrJsonUploadInput'); if (j) j.click(); }, 80); }
    });
  }

  rows.push({
    cls: 'btn-supplier', icon: '📦',
    label: suppliersAlreadyLoaded ? 'Ещё один прайс поставщика' : 'Загрузить прайс поставщика',
    hint: suppliersAlreadyLoaded ? 'Добавить ещё один файл поставщика' : 'Откройте файл поставщика для подготовки столбцов',
    action: () => { obrCloseNextStep(); obrSetType('supplier'); fileInput.click(); }
  });

  if (!myPriceAlreadyLoaded) {
    rows.push({
      cls: 'btn-myprice', icon: '🏷️',
      label: 'Загрузить мой прайс',
      hint: 'Откройте свой прайс-лист для подготовки',
      action: () => { obrCloseNextStep(); obrSetType('myprice'); if (fileInputMyPrice) fileInputMyPrice.click(); }
    });
  }

  rows.push({
    cls: 'btn-monitor', icon: '📊',
    label: 'Перейти к мониторингу',
    hint: 'Открыть таблицу мониторинга цен',
    action: () => { obrCloseNextStep(); switchMainPane('monitor'); }
  });

  btns.innerHTML = '';
  rows.forEach(r => {
    const btn = document.createElement('button');
    btn.className = 'obr-nextstep-btn ' + r.cls;
    btn.innerHTML = `<span class="obr-nextstep-btn-icon">${r.icon}</span>
      <span class="obr-nextstep-btn-text">
        <span class="obr-nextstep-btn-label">${r.label}</span>
        <span class="obr-nextstep-btn-hint">${r.hint}</span>
      </span>`;
    btn.addEventListener('click', r.action);
    btns.appendChild(btn);
  });

  modal.classList.add('visible');
}

function obrCloseNextStep() {
  const m = document.getElementById('obrNextStepModal');
  if (m) m.classList.remove('visible');
}
document.addEventListener('DOMContentLoaded', function() {
  const m = document.getElementById('obrNextStepModal');
  if (m) m.addEventListener('click', function(e) { if (e.target === this) obrCloseNextStep(); });
  // Lock price cards if no JSON loaded yet
  if (typeof _updatePriceCardsLock === 'function') _updatePriceCardsLock();
});

resetBtn.addEventListener("click", function() {
  selectedColumns.clear(); startRowIndex = 0; obrRenderTable();
});

function renderSynPanel(panel, tplName) {
  panel.innerHTML = "";
  const syns = columnSynonyms[tplName] || [];
  const lbl = document.createElement("div"); lbl.className = "syn-label";
  lbl.textContent = "Кросскоды для автораспознавания:"; panel.appendChild(lbl);
  const chips = document.createElement("div"); chips.className = "syn-chips";
  syns.forEach((s, i) => {
    const chip = document.createElement("div"); chip.className = "syn-chip";
    const inp = document.createElement("input"); inp.className = "syn-input"; inp.type = "text"; inp.value = s;
    inp.addEventListener("change", () => { columnSynonyms[tplName][i] = inp.value.trim(); persistAll(); });
    const rm = document.createElement("button"); rm.className = "syn-remove"; rm.textContent = "×";
    rm.addEventListener("click", () => { columnSynonyms[tplName].splice(i,1); persistAll(); renderSynPanel(panel,tplName); });
    chip.appendChild(inp); chip.appendChild(rm); chips.appendChild(chip);
  });
  panel.appendChild(chips);
  const addRow = document.createElement("div"); addRow.className = "syn-add-row";
  const addInp = document.createElement("input"); addInp.className = "syn-new-input"; addInp.type = "text"; addInp.placeholder = "Новый кросскод…";
  const addBtn = document.createElement("button"); addBtn.className = "btn btn-success"; addBtn.textContent = "+ Добавить";
  addBtn.addEventListener("click", () => {
    const v = addInp.value.trim(); if (!v) return;
    if (!columnSynonyms[tplName]) columnSynonyms[tplName] = [];
    columnSynonyms[tplName].push(v); persistAll(); addInp.value = ""; renderSynPanel(panel, tplName);
  });
  addInp.addEventListener("keydown", e => { if (e.key === "Enter") addBtn.click(); });
  addRow.appendChild(addInp); addRow.appendChild(addBtn); panel.appendChild(addRow);
}

function renderTemplatesList() {
  templatesList.innerHTML = "";
  const total = columnTemplates.length;
  columnTemplates.forEach((t, idx) => {
    const block = document.createElement("div"); block.className = "tpl-block";
    const row = document.createElement("div"); row.className = "tpl-row";

    const upBtn = document.createElement("button"); upBtn.className = "btn"; upBtn.textContent = "↑"; upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", () => { if (!idx) return; [columnTemplates[idx-1],columnTemplates[idx]]=[columnTemplates[idx],columnTemplates[idx-1]]; persistAll(); renderTemplatesList(); obrRenderTable(); });

    const dnBtn = document.createElement("button"); dnBtn.className = "btn"; dnBtn.textContent = "↓"; dnBtn.disabled = idx === total-1;
    dnBtn.addEventListener("click", () => { if (idx===total-1) return; [columnTemplates[idx],columnTemplates[idx+1]]=[columnTemplates[idx+1],columnTemplates[idx]]; persistAll(); renderTemplatesList(); obrRenderTable(); });

    const inp = document.createElement("input"); inp.type = "text"; inp.value = t;
    const oldName = t;
    inp.addEventListener("change", () => {
      const n = inp.value.trim(); if (!n || n === oldName) return;
      if (columnSynonyms[oldName] !== undefined) { columnSynonyms[n] = columnSynonyms[oldName]; delete columnSynonyms[oldName]; }
      columnTemplates[idx] = n; persistAll(); renderTemplatesList(); obrRenderTable();
    });

    const synBtn = document.createElement("button"); synBtn.className = "btn"; synBtn.textContent = "🔤 Кросскоды";
    synBtn.addEventListener("click", () => {
      const p = block.querySelector(".syn-panel"); if (!p) return;
      const vis = p.style.display !== "none";
      p.style.display = vis ? "none" : "block";
      synBtn.textContent = vis ? "🔤 Кросскоды" : "🔤 Кросскоды ▲";
    });

    const delBtn = document.createElement("button"); delBtn.className = "btn btn-danger"; delBtn.textContent = "Удалить";
    delBtn.addEventListener("click", () => { columnTemplates.splice(idx,1); persistAll(); renderTemplatesList(); obrRenderTable(); });

    row.appendChild(upBtn); row.appendChild(dnBtn); row.appendChild(inp);
    row.appendChild(synBtn); row.appendChild(delBtn); block.appendChild(row);

    const synPanel = document.createElement("div"); synPanel.className = "syn-panel"; synPanel.style.display = "none";
    renderSynPanel(synPanel, t); block.appendChild(synPanel);
    templatesList.appendChild(block);
  });
}

manageTemplatesBtn.addEventListener("click", e => { e.stopPropagation(); renderTemplatesList(); _updateColSettingsBadge(); templatesModal.style.display = "flex"; newTemplateInput.value = ""; newTemplateInput.focus(); });
closeTemplatesModal.addEventListener("click", () => { templatesModal.style.display = "none"; });
templatesModal.addEventListener("click", e => { if (e.target === templatesModal) templatesModal.style.display = "none"; });

(function() {
  const btn = document.getElementById('colDetectManualToggle');
  const body = document.getElementById('colDetectManualBody');
  const arrow = document.getElementById('colDetectManualArrow');
  if (btn && body) {
    btn.addEventListener('click', function() {
      const open = body.classList.toggle('open');
      if (arrow) arrow.textContent = open ? '▼' : '▶';
    });
  }
})();

function _updateColSettingsBadge() {
  const badge = document.getElementById('colSettingsSourceBadge');
  const demoBanner = document.getElementById('colSettingsDemoBanner');
  const fileBanner = document.getElementById('colSettingsFileBanner');
  if (!badge) return;
  if (_columnSettingsFromFile) {
    badge.className = 'col-settings-source-badge col-settings-source-badge--file';
    badge.textContent = '✅ из файла';
    if (demoBanner) demoBanner.style.display = 'none';
    if (fileBanner) fileBanner.style.display = '';
  } else {
    badge.className = 'col-settings-source-badge col-settings-source-badge--demo';
    badge.textContent = '📋 демо-данные';
    if (demoBanner) demoBanner.style.display = '';
    if (fileBanner) fileBanner.style.display = 'none';
  }
}

addTemplateBtn.addEventListener("click", () => {
  const v = newTemplateInput.value.trim(); if (!v) return;
  columnTemplates.push(v); persistAll(); renderTemplatesList(); obrRenderTable();
  newTemplateInput.value = ""; newTemplateInput.focus();
});
newTemplateInput.addEventListener("keydown", e => { if (e.key === "Enter") addTemplateBtn.click(); });

AppBridge.on('csvReady', async function(data) {

  const { csvText, fileName, isMyPrice } = data;

  const loadedPanel = document.getElementById('obr-loaded-files');
  const loadedList  = document.getElementById('obr-loaded-list');
  if (loadedPanel && loadedList) {
    loadedPanel.style.display = 'flex';
    const chip = document.createElement('span');
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:' + (isMyPrice ? 'var(--accent-bg)' : 'var(--green-bg)') + ';border:1px solid ' + (isMyPrice ? '#C7D7F5' : '#A7F3D0') + ';border-radius:var(--radius-md);padding:3px 8px;font-size:var(--fz-sm);font-weight:500;white-space:nowrap;color:' + (isMyPrice ? 'var(--accent-dark)' : 'var(--green-dark)') + ';';
    const chipIcon = document.createElement('span');
    chipIcon.textContent = isMyPrice ? '🏷️' : '📦';
    const chipName = document.createElement('span');
    chipName.textContent = fileName;
    const chipDel = document.createElement('button');
    chipDel.title = 'Убрать из мониторинга';
    chipDel.style.cssText = 'background:none;border:none;cursor:pointer;color:inherit;opacity:0.5;font-size:13px;line-height:1;padding:0 0 0 2px;transition:opacity 100ms;';
    chipDel.textContent = '✕';
    chipDel.onmouseenter = () => { chipDel.style.opacity = '1'; };
    chipDel.onmouseleave = () => { chipDel.style.opacity = '0.5'; };
    chipDel.onclick = () => {
      if (isMyPrice) {
        if (window._pmApp) { window._pmApp.myPriceData = null; }
        chip.remove();
        if (!loadedList.children.length) loadedPanel.style.display = 'none';
        showToast('Свой прайс удалён из мониторинга', 'ok');
      } else {
        // FIX: chip.remove() must happen AFTER the user confirms deletion,
        // not immediately (old code left jeConfirmModal open, blocking cart clicks)
        if (window._pmApp && window.removeSupplierFile) {
          window.removeSupplierFile(fileName).then(function(removed) {
            if (removed) {
              chip.remove();
              if (!loadedList.children.length) loadedPanel.style.display = 'none';
            }
          });
        } else {
          chip.remove();
          if (!loadedList.children.length) loadedPanel.style.display = 'none';
        }
      }
    };
    chip.appendChild(chipIcon);
    chip.appendChild(chipName);
    chip.appendChild(chipDel);
    loadedList.appendChild(chip);
  }

  if (!window._pmApp) {
    showToast('Ошибка: модуль мониторинга не инициализирован', 'err');
    return;
  }

  const pm = window._pmApp;

  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const file = new File([blob], fileName, { type: 'text/csv' });
  const displayName = isMyPrice ? 'Мой прайс' : pm.removeFileExtension(fileName);

  let fileData;
  try {
    fileData = await pm.parseFile(file, displayName);
  } catch(parseErr) {
    showToast('Ошибка разбора CSV: ' + parseErr.message, 'err');
    return;
  }

  try {
    if (isMyPrice) {
      pm.myPriceData = fileData;
      pm.updateMyPriceStatus(fileName);
    } else {
      const added = pm.addCompetitorFile(fileData);
      if (added === false) return;

      pm.updateCompetitorStatus();
    }
  } catch(stateErr) {
  }

  try {
    pm.processAllData();
  } catch(procErr) {
    showToast('Ошибка формирования таблицы: ' + procErr.message, 'err');
  }
});

AppBridge.on('settingsLoaded', function(data) {
  if (data && data.columnSettings) {
    const cs = data.columnSettings;
    if (Array.isArray(cs.templates) && cs.templates.length) {
      columnTemplates = cs.templates.slice();
    }
    if (cs.synonyms && typeof cs.synonyms === 'object') {
      columnSynonyms = JSON.parse(JSON.stringify(cs.synonyms));
    }

    _columnSettingsFromFile = true;
    persistAll(false);

    _updateColSettingsBadge();
    if (typeof renderTemplatesList === 'function') renderTemplatesList();
  }
});


"use strict";

let _bcAddState = null;

function showToast(msg, type, ms) {
  type = type || 'info'; ms = ms || 3200;
  const rack = document.getElementById('toastRack');
  const el = document.createElement('div');
  el.className = 'je-toast ' + type;
  var _icon = ({ok:'✅',err:'❌',warn:'⚠️',info:'ℹ️'}[type]||'');
  el.textContent = (_icon && msg.trimStart().startsWith(_icon) ? '' : (_icon ? _icon + ' ' : '')) + msg;
  rack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, ms);
}

function _slotFileRow(name, meta, onClear) {
  const safe = n => n.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const row = document.createElement('div');
  row.className = 'slot-file-row';
  row.innerHTML = `<span class="slot-file-row-name" title="${safe(name)}">${safe(name)}</span>`
    + (meta ? `<span class="slot-file-row-count">${safe(String(meta))}</span>` : '')
    + (onClear ? `<button class="slot-file-row-del" title="Удалить">✕</button>` : '');
  if (onClear) row.querySelector('.slot-file-row-del').addEventListener('click', onClear);
  return row;
}
function _slotShowJsonChip(fileName, groupCount) {
  const statusEl = document.getElementById('synonymsStatus');
  const list = document.getElementById('jsonFileList');
  if (statusEl) statusEl.style.display = 'none';
  if (list) {
    list.innerHTML = '';
    list.appendChild(_slotFileRow(fileName || 'JSON',
      groupCount != null ? groupCount + ' гр.' : null,
      () => { if (typeof clearAll === 'function') clearAll(); }));
  }
}
function _slotClearJsonChip() {
  const statusEl = document.getElementById('synonymsStatus');
  const list = document.getElementById('jsonFileList');
  if (statusEl) { statusEl.style.display = ''; statusEl.textContent = 'Не загружена'; statusEl.className = 'monitor-info-slot-status'; }
  if (list) list.innerHTML = '';
}
function _slotShowMyPriceChip(fileName, rowCount) {
  const statusEl = document.getElementById('myPriceStatus');
  const list = document.getElementById('myPriceFileList');
  if (statusEl) statusEl.style.display = 'none';
  if (list) {
    list.innerHTML = '';
    list.appendChild(_slotFileRow(fileName || 'Прайс',
      rowCount != null ? rowCount.toLocaleString('ru') + ' стр.' : null,
      () => { if (typeof clearAll === 'function') clearAll(); }));
  }
}
function _slotClearMyPriceChip() {
  const statusEl = document.getElementById('myPriceStatus');
  const list = document.getElementById('myPriceFileList');
  if (statusEl) { statusEl.style.display = ''; statusEl.textContent = 'Не загружен'; statusEl.className = 'monitor-info-slot-status'; }
  if (list) list.innerHTML = '';
}

function _slotHideCompetitorStatus() {
  const statusEl = document.getElementById('competitorStatus');
  if (statusEl) statusEl.style.display = 'none';
}
function _slotShowCompetitorStatus(text) {
  const statusEl = document.getElementById('competitorStatus');
  if (statusEl) { statusEl.style.display = ''; statusEl.textContent = text; statusEl.className = 'monitor-info-slot-status'; }
}

let _jeConfirmResolve = null;
function jeConfirmDialog(msg, title) {
  return new Promise(resolve => {

    if (_jeConfirmResolve) { _jeConfirmResolve(false); _jeConfirmResolve = null; }
    _jeConfirmResolve = resolve;
    document.getElementById('jeConfirmTitle').textContent = title || 'Подтверждение';

    const msgEl = document.getElementById('jeConfirmMsg');
    msgEl.innerHTML = msg;

    const inner = document.querySelector('#jeConfirmModal .modal-inner');
    if (inner) {
      const hasHtml = /<[a-z]/i.test(msg);
      inner.style.maxWidth = hasHtml ? '520px' : '';
      inner.style.width = hasHtml ? '520px' : '';
    }
    document.getElementById('jeConfirmModal').style.display = 'flex';
  });
}
function jeConfirmClose(result) {
  document.getElementById('jeConfirmModal').style.display = 'none';

  const inner = document.querySelector('#jeConfirmModal .modal-inner');
  if (inner) { inner.style.maxWidth = ''; inner.style.width = ''; }
  if (_jeConfirmResolve) { _jeConfirmResolve(result); _jeConfirmResolve = null; }
}

const MATCHER_WORKER_SRC = `
"use strict";
const TL=[['ight','айт'],['tion','шн'],['ough','оф'],['sch','ш'],['tch','ч'],['all','ол'],['ing','инг'],['igh','ай'],['ull','ул'],['oor','ур'],['alk','ок'],['awn','он'],['sh','ш'],['ch','ч'],['zh','ж'],['kh','х'],['ph','ф'],['th','т'],['wh','в'],['ck','к'],['qu','кв'],['ts','ц'],['tz','ц'],['oo','у'],['ee','и'],['ea','и'],['ui','у'],['ew','ю'],['aw','о'],['ow','оу'],['oi','ой'],['oy','ой'],['ai','ей'],['ay','ей'],['au','о'],['ou','у'],['bb','бб'],['cc','кк'],['dd','дд'],['ff','фф'],['gg','гг'],['ll','лл'],['mm','мм'],['nn','нн'],['pp','пп'],['rr','рр'],['ss','сс'],['tt','тт'],['zz','цц'],['a','а'],['b','б'],['c','к'],['d','д'],['e','э'],['f','ф'],['g','г'],['h','х'],['i','и'],['j','дж'],['k','к'],['l','л'],['m','м'],['n','н'],['o','о'],['p','п'],['q','к'],['r','р'],['s','с'],['t','т'],['u','у'],['v','в'],['w','в'],['x','кс'],['y','й'],['z','з']];
const WORD_END=[[/блес$/,'блс'],[/тлес$/,'тлс'],[/плес$/,'плс'],[/лес$/,'лс'],[/([бвгджзклмнпрстфхцчшщ])ес$/,'$1с'],[/([бвгджзклмнпрстфхцчшщ])е$/,'$1']];
const STOP=new Set(['и','или','в','на','с','по','для','к','от','из','за','не','как','это','то','the','a','an','of','for','with','and','or','in','on','at','to','by']);
const UNIT_CANON=new Map([['г','г'],['г.','г'],['гр','г'],['гр.','г'],['грамм','г'],['граммов','г'],['грамма','г'],['g','г'],['gr','г'],['gramm','г'],['gram','г'],['мг','мг'],['мг.','мг'],['миллиграмм','мг'],['миллиграммов','мг'],['mg','мг'],['кг','кг'],['кг.','кг'],['килограмм','кг'],['килограммов','кг'],['кило','кг'],['kg','кг'],['мл','мл'],['мл.','мл'],['миллилитр','мл'],['миллилитров','мл'],['ml','мл'],['л','л'],['л.','л'],['литр','л'],['литров','л'],['литра','л'],['l','л'],['lt','л'],['ltr','л'],['шт','шт'],['шт.','шт'],['штука','шт'],['штук','шт'],['штуки','шт'],['pcs','шт'],['pc','шт'],['pcs.','шт']]);
const UNIT_CONV={'мг':{base:'г',factor:0.001},'г':{base:'г',factor:1},'кг':{base:'г',factor:1000},'мл':{base:'мл',factor:1},'л':{base:'мл',factor:1000}};
const ABBR_DICT=new Map([['уп','упаковка'],['упак','упаковка'],['упк','упаковка'],['нб','набор'],['нбр','набор'],['кор','коробка'],['ком','комплект'],['компл','комплект'],['кмп','комплект']]);
function normalizeUnits(s){return s.replace(/(\\d+(?:[.,]\\d+)?)\\s*([а-яёa-zA-Z]{1,12}\\.?)/gi,(m,num,unitStr)=>{const uk=unitStr.toLowerCase().replace(/\\.$/,'');const canon=UNIT_CANON.get(uk);if(!canon)return m;const conv=UNIT_CONV[canon];if(!conv)return num+canon+' ';const val=Math.round(parseFloat(num.replace(',','.'))*conv.factor*100000)/100000;return val+conv.base+' ';});}
function expandAbbr(tokens){const res=[];for(const t of tokens){const exp=ABBR_DICT.get(t);if(exp){for(const w of exp.split(' ')){if(w.length>1&&!STOP.has(w))res.push(w);}}else{res.push(t);}}return res;}
function translitWord(w){let s=w.toLowerCase(),out='',i=0;while(i<s.length){let hit=false;for(const[lat,cyr]of TL){if(s.startsWith(lat,i)){out+=cyr;i+=lat.length;hit=true;break;}}if(!hit){out+=s[i];i++;}}for(const[re,rep]of WORD_END)out=out.replace(re,rep);return out;}
const _VOW=new Set('аеёиоуыэюя'.split(''));const _isV=c=>_VOW.has(c);
function _rv(w){for(let i=0;i<w.length;i++)if(_isV(w[i]))return i+1;return w.length;}
function _r1(w){for(let i=1;i<w.length;i++)if(!_isV(w[i])&&_isV(w[i-1]))return i+1;return w.length;}
function _r2(w,r1){for(let i=r1+1;i<w.length;i++)if(!_isV(w[i])&&_isV(w[i-1]))return i+1;return w.length;}
function _strip(w,ss,f){const s=[...ss].sort((a,b)=>b.length-a.length);for(const x of s)if(w.endsWith(x)&&(w.length-x.length)>=f)return w.slice(0,-x.length);return null;}
function stemRu(word){if(!word||word.length<=2)return word;if(!/[а-яё]/.test(word))return word;const rv=_rv(word),r1=_r1(word),r2=_r2(word,r1);let w=word,r;r=_strip(w,['ившись','ивши','ывшись','ывши','ив','ыв'],rv);if(r!=null){w=r;}else{const pa=new Set(['а','я']);r=null;const pvf=['авшись','явшись','авши','явши','ав','яв'];for(const x of pvf.sort((a,b)=>b.length-a.length)){if(w.endsWith(x)&&pa.has(w[w.length-x.length-1]||'')){r=w.slice(0,-x.length);break;}}if(r!=null)w=r;}r=_strip(w,['ся','сь'],rv);if(r!=null)w=r;const ADJ=['ими','ыми','ией','ий','ый','ой','ей','ем','им','ым','ом','его','ого','ему','ому','ую','юю','ая','яя','ое','ее'];let adj=false;for(const s of [...ADJ].sort((a,b)=>b.length-a.length)){if(w.endsWith(s)&&(w.length-s.length)>=rv){w=w.slice(0,-s.length);adj=true;break;}}if(!adj){const VA=['ала','яла','али','яли','ало','яло','ана','яна','ает','яет','ают','яют','аешь','яешь','ай','яй','ал','ял','ать','ять'];const VF=['ила','ыла','ена','ейте','уйте','ите','или','ыли','ей','уй','ил','ыл','им','ым','ен','ило','ыло','ено','ует','уют','ит','ыт','ишь','ышь','ую','ю'];const pa=new Set(['а','я']);r=null;for(const x of VA.sort((a,b)=>b.length-a.length)){if(w.endsWith(x)&&(w.length-x.length)>=rv&&pa.has(w[w.length-x.length-1]||'')){r=w.slice(0,-x.length);break;}}if(r==null)r=_strip(w,VF,rv);if(r!=null){w=r;}else{const N=['иями','ями','ами','ией','ием','иям','ев','ов','ие','ье','еи','ии','ей','ой','ий','ям','ем','ам','ом','ях','ах','е','и','й','о','у','а','ь','ю','я'];r=_strip(w,N,rv);if(r!=null)w=r;}}if(w.endsWith('и')&&(w.length-1)>=rv)w=w.slice(0,-1);r=_strip(w,['ость','ост'],r2);if(r!=null)w=r;if(w.endsWith('нн'))w=w.slice(0,-1);if(w.endsWith('ь')&&(w.length-1)>=rv)w=w.slice(0,-1);return w.length>=2?w:word;}
// PKG_ABBR: раскрываем аббревиатуры упаковки ДО того как normalize() снесёт символы /\.
// Это позволяет bsynMap корректно сматчить "ст/б" и "стеклобанка" — оба станут одним токеном.
const PKG_ABBR=new Map([['ст/б','стеклобанка'],['с/б','стеклобанка'],['стб','стеклобанка'],['м/у','мягкаяупаковка'],['м/уп','мягкаяупаковка'],['ж/б','жестяная'],['д/п','дойпак'],['с/я','саше'],['ф/п','саше'],['пл/б','пластик'],['б/к','безконверта']]);
function pkgExpand(s){return s.split(' ').map(function(t){return PKG_ABBR.get(t)||t;}).join(' ');}
function preNorm(raw){let s=normalizeUnits(String(raw||''));s=s.replace(/([а-яёa-zA-Z])-([а-яёa-zA-Z])/gi,'$1 $2');s=s.toLowerCase();return pkgExpand(s);}
function normalize(raw){if(!raw)return '';let s=preNorm(raw);s=s.replace(/[^\\wа-яё0-9\\s]/gi,' ').replace(/[a-z]+/gi,m=>translitWord(m)).replace(/\\s+/g,' ').trim();const toks=s.split(' ').filter(w=>{if(STOP.has(w))return false;if(/^\\d+$/.test(w))return true;return w.length>=2||/^[а-яёa-z0-9]+$/i.test(w);});return expandAbbr(toks).map(t=>stemRu(t)).join(' ');}
// Применить словарь брендов: заменить синонимы на канонические формы
// applyBrandNorm: заменяет синонимы (в т.ч. мультитокенные) на канонические формы.
// Приоритет поиска: trigram → bigram → unigram.
// Это позволяет корректно обрабатывать бренды из 2-3 слов ("kit kat", "alpen gold", "carte noire").
function applyBrandNorm(norm,bsynMap){
  if(!bsynMap||!bsynMap.size)return norm;
  const toks=norm.split(' ');
  const out=[];
  let i=0;
  while(i<toks.length){
    let matched=false;
    // Trigram (3 токена): "carte du noir" и т.п.
    if(!matched&&i+2<toks.length){
      const key=toks[i]+' '+toks[i+1]+' '+toks[i+2];
      const mapped=bsynMap.get(key);
      if(mapped){for(const t of mapped.split(' '))out.push(t);i+=3;matched=true;}
    }
    // Bigram (2 токена): "kit kat", "alpen gold", "earl grey" и т.п.
    if(!matched&&i+1<toks.length){
      const key=toks[i]+' '+toks[i+1];
      const mapped=bsynMap.get(key);
      if(mapped){for(const t of mapped.split(' '))out.push(t);i+=2;matched=true;}
    }
    // Unigram (1 токен)
    if(!matched){out.push(bsynMap.get(toks[i])||toks[i]);i++;}
  }
  return out.join(' ');
}
// ── ГИБРИДНЫЙ УЛУЧШЕННЫЙ МАТЧИНГ ─────────────────────────────────────────
// Старые алгоритмы (trigrams, LCS, IDF) сохранены — они хорошо работают с русским.
// Новые метрики (Token Sort, Partial Ratio) добавлены поверх как дополнительные сигналы.
function trigrams(s){const st=new Set(),p='#'+s+'#';for(let i=0;i<p.length-2;i++)st.add(p.slice(i,i+3));return st;}
function triSim(a,b){if(!a||!b)return 0;const ta=trigrams(a),tb=trigrams(b);let n=0;for(const g of ta)if(tb.has(g))n++;return n*2/(ta.size+tb.size);}
function lcsLen(a,b){const A=a.split(' ').slice(0,80),B=b.split(' ').slice(0,80);let prev=new Uint8Array(B.length+1),curr=new Uint8Array(B.length+1);for(let i=0;i<A.length;i++){for(let j=0;j<B.length;j++)curr[j+1]=A[i]===B[j]?prev[j]+1:Math.max(curr[j],prev[j+1]);[prev,curr]=[curr,prev];curr.fill(0);}return prev[B.length];}
function lcsSim(a,b){if(!a||!b)return(a===b)?1:0;const wa=Math.min(a.split(' ').length,80),wb=Math.min(b.split(' ').length,80);return 2*lcsLen(a,b)/(wa+wb);}
// extractMeasurements: конвертирует все формы единиц в г/мл
const _UCANON={'г.':'г','гр':'г','гр.':'г','грамм':'г','граммов':'г','грамма':'г','г':'г','миллиграмм':'мг','миллиграммов':'мг','мг':'мг','кг.':'кг','килограмм':'кг','килограммов':'кг','кило':'кг','кг':'кг','мл.':'мл','миллилитр':'мл','миллилитров':'мл','мл':'мл','л.':'л','литр':'л','литра':'л','литров':'л','л':'л','g':'г','gr':'г','mg':'мг','kg':'кг','ml':'мл','ltr':'л','lt':'л','l':'л'};
const _UCANON_PAT=/(\\d+(?:[.,]\\d+)?)\\s*(миллиграммов|миллиграмм|килограммов|килограмм|миллилитров|миллилитр|граммов|грамма|грамм|литров|литра|литр|кило|мг|гр|кг|мл|ltr|lt|kg|ml|mg|gr|л|г|g|l)(?=[^a-z\\u0430-\\u044f]|$)/gi;
const _UCONV2={'г':['г',1],'мг':['г',0.001],'кг':['г',1000],'мл':['мл',1],'л':['мл',1000]};
function _normalizeUnitsText(s){return s.replace(_UCANON_PAT,function(m,num,unit){var c=_UCANON[unit.toLowerCase().replace(/\\.$/,'')];return c?num+c:m;});}
function extractMeasurements(raw){
  var s=_normalizeUnitsText(raw.toLowerCase());
  var res=[],seen=[];
  var packRe=/(\\d+(?:[.,]\\d+)?)\\s*[xх×*]\\s*(\\d+(?:[.,]\\d+)?)\\s*(г|мг|кг|мл|л)|(\\d+(?:[.,]\\d+)?)\\s*(г|мг|кг|мл|л)\\s*[xх×*]\\s*(\\d+(?:[.,]\\d+)?)/g;
  var m;
  while((m=packRe.exec(s))!==null){
    seen.push([m.index,packRe.lastIndex]);
    var cnt=m[3]?parseFloat(m[1].replace(',','.')):parseFloat(m[6].replace(',','.'));
    var val=m[3]?parseFloat(m[2].replace(',','.')):parseFloat(m[4].replace(',','.'));
    var unit=m[3]||m[5];
    var cv=_UCONV2[unit];if(!cv)continue;
    res.push({total:Math.round(val*cnt*cv[1]*1e6)/1e6,single:Math.round(val*cv[1]*1e6)/1e6,count:cnt,base:cv[0]});
  }
  var unitRe=/(\\d+(?:[.,]\\d+)?)\\s*(г|мг|кг|мл|л)/g;
  while((m=unitRe.exec(s))!==null){
    var skip=false;for(var pi=0;pi<seen.length;pi++){if(m.index>=seen[pi][0]&&m.index<seen[pi][1]){skip=true;break;}}
    if(skip)continue;
    var cv2=_UCONV2[m[2]];if(!cv2)continue;
    var v2=parseFloat(m[1].replace(',','.'));
    res.push({total:Math.round(v2*cv2[1]*1e6)/1e6,single:Math.round(v2*cv2[1]*1e6)/1e6,count:1,base:cv2[0]});
  }
  return res;
}
function weightsCompare(m1,m2){
  // +0.18 — точное совпадение простых единиц (1л=1000мл, 250г=0.25кг)
  // -0.18 — явное несовпадение простых единиц (190г vs 500г)
  //  0    — нейтрально: нет данных, или хотя бы одна сторона — упаковка (4×250г)
  //          упаковка не даёт бонус: продают поштучно, блок ≠ штука
  if(!m1.length||!m2.length)return 0;
  const isSimple=x=>x.count===1;
  const simple1=m1.filter(isSimple),simple2=m2.filter(isSimple);
  // Бонус только если обе стороны — простые единицы и total совпадает
  if(simple1.length&&simple2.length){
    const s1=new Set(simple1.map(x=>x.total+'|'+x.base));
    const s2=new Set(simple2.map(x=>x.total+'|'+x.base));
    for(const v of s1)if(s2.has(v))return 0.18;  // совпадение (с конвертацией)
    // Штраф только если одни базовые единицы но разные значения
    const b1=new Set(simple1.map(x=>x.base)),b2=new Set(simple2.map(x=>x.base));
    for(const b of b1)if(b2.has(b))return -0.18;
  }
  return 0; // упаковка или несравнимые единицы — нейтрально
}
// Новые вспомогательные метрики
function jaccardSim(s1,s2){const set1=new Set(s1.split(' ').filter(Boolean)),set2=new Set(s2.split(' ').filter(Boolean));const inter=[...set1].filter(x=>set2.has(x)).length;return inter/(set1.size+set2.size-inter)||0;}
function partialRatio(s1,s2){if(s1.includes(s2)||s2.includes(s1))return 1.0;return s1.length>s2.length?s2.length/s1.length:s1.length/s2.length;}
function getBrandMatchBonus(name1,name2){return 0;}  // расширяемо через _brandDB
function getNumericMatchBonus(name1,name2){return 0;} // расширяемо
function buildIDF(items){const df=new Map();for(const it of items){const seen=new Set(it._norm.split(' ').filter(t=>t.length>0));for(const t of seen)df.set(t,(df.get(t)||0)+1);}const N=items.length,idf=new Map();for(const[t,freq]of df)idf.set(t,Math.log((N+1)/(freq+1))+1);return idf;}
function wTokenSim(a,b,idf){const A=a.split(' '),B=b.split(' ');let wA=0,wB=0;const mA=new Map(),mB=new Map();for(const t of A){const w=idf.get(t)||1;mA.set(t,(mA.get(t)||0)+w);wA+=w;}for(const t of B){const w=idf.get(t)||1;mB.set(t,(mB.get(t)||0)+w);wB+=w;}if(!wA||!wB)return 0;let inter=0;for(const[t,wa]of mA)if(mB.has(t))inter+=Math.min(wa,mB.get(t));return 2*inter/(wA+wB);}
function buildInvIdx(items){const idx=new Map();items.forEach((it,i)=>{for(const tok of it._norm.split(' ')){if(tok.length<1)continue;if(!idx.has(tok))idx.set(tok,[]);idx.get(tok).push(i);}});return idx;}
function getCandidates(norm,idx,limit,idf){const toks=norm.split(' ').filter(t=>t.length>0);const scores=new Map();for(const t of toks){const w=idf?(idf.get(t)||1):1;for(const id of(idx.get(t)||[]))scores.set(id,(scores.get(id)||0)+w);}const ranked=[...scores.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([id])=>id);if(idf){const IDF_RARE=3.0;const rareToks=toks.filter(t=>(idf.get(t)||0)>IDF_RARE).slice(0,6);const rankedSet=new Set(ranked);for(const t of rareToks){for(const id of(idx.get(t)||[]).slice(0,25)){if(!rankedSet.has(id)){ranked.push(id);rankedSet.add(id);}}}}return ranked;}
// calcSim — гибрид: старые алгоритмы (tri+lcs+idf+синонимы+числа) + новые метрики (token sort, partial)
function calcSim(name1,name2,idf,bsynMap,bantMap){const pre1=preNorm(name1),pre2=preNorm(name2);const meas1=extractMeasurements(pre1),meas2=extractMeasurements(pre2);let n1=normalize(name1),n2=normalize(name2);if(!n1||!n2)return 0;
let synBonus=0;
if(bsynMap&&bsynMap.size){
  const n1b=n1,n2b=n2;
  n1=applyBrandNorm(n1,bsynMap);n2=applyBrandNorm(n2,bsynMap);
  if(n1!==n1b||n2!==n2b){
    const setAfter1=new Set(n1.split(' ')),setAfter2=new Set(n2.split(' '));
    const setBefore1=new Set(n1b.split(' ')),setBefore2=new Set(n2b.split(' '));
    for(const t of setAfter1){if(!setBefore1.has(t)&&setAfter2.has(t)){synBonus=0.20;break;}}
    if(!synBonus){for(const t of setAfter2){if(!setBefore2.has(t)&&setAfter1.has(t)){synBonus=0.20;break;}}}
  }
}
if(bantMap&&bantMap.size){
  const toks1=n1.split(' '),toks2=n2.split(' ');
  function _getBantSets(toks){const sets=[];for(const t of toks){if(bantMap.has(t))sets.push(bantMap.get(t));}for(let j=0;j<toks.length-1;j++){const bi=toks[j]+' '+toks[j+1];if(bantMap.has(bi))sets.push(bantMap.get(bi));}return sets;}
  function _tokSet(toks){const s=new Set(toks);for(let j=0;j<toks.length-1;j++)s.add(toks[j]+' '+toks[j+1]);return s;}
  const anti1=_getBantSets(toks1),set2=_tokSet(toks2);
  for(const anti of anti1){for(const t of set2){if(anti.has(t))return 0;}}
  const anti2=_getBantSets(toks2),set1=_tokSet(toks1);
  for(const anti of anti2){for(const t of set1){if(anti.has(t))return 0;}}
}
// Вес/объём: конвертируем единицы и сравниваем (1л=1000мл, 0.25кг=250г, 4×250г=1кг)
const weightDelta=weightsCompare(meas1,meas2);
let numFactor=1.0,numBonus=0;
if(weightDelta>0){numBonus=weightDelta;}                          // совпадение → бонус
else if(weightDelta<0){numFactor=0.82;}                           // несовпадение → штраф
if(synBonus>0&&numFactor<1)numFactor=Math.max(numFactor,0.88);   // синоним смягчает штраф
const wc1=n1.split(' ').length,wc2=n2.split(' ').length;const lenRatio=Math.min(wc1,wc2)/Math.max(wc1,wc2);const lenPenalty=lenRatio<0.33?0.6:lenRatio<0.5?0.82:1.0;
const n1s=n1.split(' ').sort().join(' ');const n2s=n2.split(' ').sort().join(' ');const tri=Math.max(triSim(n1,n2),triSim(n1s,n2s));const lcss=Math.max(lcsSim(n1,n2),lcsSim(n1s,n2s));const wTok=idf?wTokenSim(n1,n2,idf):lcss;const len=(n1.split(' ').length+n2.split(' ').length)/2;const wTri=len<=3?0.25:0.35,wLcs=len<=3?0.20:0.25,wTok_=len<=3?0.55:0.40;
let score=(tri*wTri+lcss*wLcs+wTok*wTok_+numBonus)*numFactor*lenPenalty+synBonus;
const fw1=n1.split(' ')[0],fw2=n2.split(' ')[0];if(fw1&&fw2&&fw1.length>2&&fw2.length>2){const fw1Idf=idf?(idf.get(fw1)||1):1,fw2Idf=idf?(idf.get(fw2)||1):1;const isRare1=fw1Idf>1.5,isRare2=fw2Idf>1.5;if(fw1===fw2&&isRare1)score=Math.min(1,score+0.04);else if(fw1!==fw2&&isRare1&&isRare2)score*=0.82;}
// Дополнительные сигналы: Token Sort Ratio и Partial Ratio поверх старых алгоритмов
const sortBonus=jaccardSim(n1s,n2s);           // хорошо ловит перестановку слов
const partialBonus=partialRatio(n1,n2);         // хорошо ловит подстроки
score=Math.max(score,(sortBonus*0.55+partialBonus*0.25+score*0.20));
let _fs=Math.min(100,Math.round(score*100));
if(_fs>=100){const _o1=String(name1||'').toLowerCase().replace(/\s+/g,' ').trim();const _o2=String(name2||'').toLowerCase().replace(/\s+/g,' ').trim();if(_o1!==_o2)_fs=99;}
return _fs;}
const BC_COLS_W=['штрихкод','штрих-код','barcode','шк','ean','код'];
const NAME_COLS_W=['название','наименование','name','товар','продукт','наим'];
function findCol(data,variants){if(!data?.length)return null;const cols=Object.keys(data[0]);return cols.find(c=>variants.some(v=>c.toLowerCase().includes(v)))??cols[0];}
self.onmessage=function({data}){
  if(data.type!=='run')return;
  const{db,priceFiles,brandDB}=data;
  const activePairs=[],knownPairs=[];

  // Build brand synonym/antonym maps for calcSim
  // Pass 1: build bsynMap (synonym->canonical) and canon2syns (canonical->all variants).
  // Все синонимы (в т.ч. мультитокенные) хранятся как ключи в bsynMap — строки с пробелами.
  // applyBrandNorm теперь поддерживает bigram/trigram lookup и найдёт их.
  // Antonyms are NOT touched here — otherwise bsynMap.set(an,an) corrupts synonym mappings
  const bsynMap=new Map(),bantMap=new Map();
  const canon2syns=new Map();
  for(const[canon,val]of Object.entries(brandDB||{})){
    const cNorm=normalize(canon);if(!cNorm)continue;
    if(!bsynMap.has(cNorm))bsynMap.set(cNorm,cNorm);
    // synSet содержит ВСЕ нормализованные варианты (canonical + все синонимы),
    // включая мультитокенные — они нужны bantMap для корректной симметрии.
    const synSet=new Set([cNorm]);
    for(const s of(val.synonyms||[])){const sn=normalize(s);if(sn){if(!bsynMap.has(sn))bsynMap.set(sn,cNorm);synSet.add(sn);}}
    canon2syns.set(cNorm,synSet);
  }
  // Pass 2: build bantMap with full synonym expansion and symmetry.
  // bantMap хранит ключи и как однотокенные ("нескаф"), так и мультитокенные ("карт нуар").
  // calcSim проверяет bantMap с поддержкой bigram — мультитокенные ключи будут найдены.
  // Симметрия: если A антоним B — bantMap[B] тоже получит все варианты A (автоматически).
  for(const[canon,val]of Object.entries(brandDB||{})){
    const cNorm=normalize(canon);if(!cNorm)continue;
    if(!(val.antonyms||[]).length)continue;
    const antiCanons=new Set();
    for(const a of(val.antonyms||[])){const an=normalize(a);if(an)antiCanons.add(bsynMap.get(an)||an);}
    const antiSet=bantMap.get(cNorm)||new Set();
    for(const ac of antiCanons){const syns=canon2syns.get(ac);if(syns){for(const s of syns)antiSet.add(s);}else antiSet.add(ac);}
    if(antiSet.size)bantMap.set(cNorm,antiSet);
    // Симметрия: добавляем все варианты cNorm в bantMap каждого антонима
    const mySyns=canon2syns.get(cNorm)||new Set([cNorm]);
    for(const ac of antiCanons){
      if(!bantMap.has(ac))bantMap.set(ac,new Set());
      for(const s of mySyns)bantMap.get(ac).add(s);
    }
  }

  // Build DB lookup: bc -> canonical key, canonical key -> display name
  const bc2key=new Map(),bc2name=new Map();
  for(const[key,val]of Object.entries(db)){
    const name=Array.isArray(val)?(val[0]||String(key)):'';
    bc2key.set(String(key),String(key));bc2name.set(String(key),name);
    if(Array.isArray(val))val.slice(1).forEach(s=>{s=String(s).trim();if(s){bc2key.set(s,String(key));bc2name.set(s,name);}});
  }

  // Build items from price files — deduplicate by (fi, bc): keep first name per bc per file
  const items=[];
  const seenBcPerFile=new Map();
  for(let fi=0;fi<priceFiles.length;fi++){
    const f=priceFiles[fi];
    const bcC=findCol(f.data,BC_COLS_W),nmC=findCol(f.data,NAME_COLS_W);
    if(!bcC||!nmC)continue;
    for(const row of f.data){
      const bc=String(row[bcC]||'').trim(),nm=String(row[nmC]||'').trim();
      if(!bc||!nm)continue;
      const fk=fi+'\x00'+bc;
      if(seenBcPerFile.has(fk))continue;
      seenBcPerFile.set(fk,true);
      items.push({bc,name:nm,fi,file:f.name,_norm:normalize(nm)});
    }
  }

  if(!items.length){self.postMessage({type:'done',activePairs:[],knownPairs:[]});return;}

  // Build jsonItems from DB for index (only entries with a name)
  const jsonItems=Object.entries(db).map(([key,val])=>{
    const name=Array.isArray(val)?(val[0]||String(key)):String(key);
    return {bc:String(key),name,fi:-1,file:'JSON',_norm:normalize(name)};
  }).filter(it=>it._norm.length>0);

  // allItems for indexing and IDF: price items + json items
  const allItems=[...items,...jsonItems];
  const invIdx=buildInvIdx(allItems);
  const idf=buildIDF(allItems);

  // ── ЛИМИТ КАНДИДАТОВ ─────────────────────────────────────────────────────
  // Сколько кандидатов проверять через calcSim для каждого товара.
  // Больше = лучше охват совпадений, но медленнее.
  // Минимум 200, максимум без ограничений (allItems.length).
  // Можно изменить число 200 или убрать Math.min для полного перебора.
  const effectiveLimit = Math.min(200, allItems.length);
  // ─────────────────────────────────────────────────────────────────────────

  // seen pairs by sorted bc pair to avoid duplicates
  const seenPairs=new Set();

  for(let i=0;i<items.length;i++){
    if(i%200===0)self.postMessage({type:'progress',pct:Math.round(i/items.length*100)});
    const a=items[i];
    const aCanon=bc2key.get(a.bc);
    const aInDB=!!aCanon;
    const aKey=aCanon||null;
    // Use DB name for matching if available (canonical)
    const matchNorm=(aInDB&&bc2name.get(a.bc))?normalize(bc2name.get(a.bc)):a._norm;

    for(const id of getCandidates(matchNorm,invIdx,effectiveLimit,idf)){
      const b=allItems[id];
      if(!b)continue;
      if(b.bc===a.bc)continue;
      // Skip same file (fi=-1 JSON items are always allowed as targets)
      if(b.fi>=0&&b.fi===a.fi)continue;
      // Skip if already in same DB group
      const bCanon=bc2key.get(b.bc);
      if(aInDB&&bCanon&&aKey===bCanon)continue;
      // Skip already-committed pair
      const pk=a.bc<b.bc?a.bc+'\x01'+b.bc:b.bc+'\x01'+a.bc;
      if(seenPairs.has(pk))continue;

      const sim=calcSim(a.name,b.name,idf,bsynMap,bantMap);
      if(sim<55)continue;

      seenPairs.add(pk);

      const bInDB=!!bCanon;
      const brandBonus=getBrandMatchBonus(a.name,b.name);
      const numericBonus=getNumericMatchBonus(a.name,b.name);
      const pair={
        bc1:a.bc,name1:a.name,file1:a.file,
        bc2:b.bc,name2:b.name,file2:b.file,
        sim,brandBonus,numericBonus,aInDB,bInDB,
        aKey:aKey||a.bc,bKey:bCanon||b.bc
      };
      if(aInDB&&bInDB&&aKey===bCanon)knownPairs.push(pair);
      else activePairs.push(pair);
    }
  }

  // Сортировка: сначала по score, потом по brandBonus + numericBonus
  const sortPairs=(a,b)=>(b.sim-a.sim)||((b.brandBonus+b.numericBonus)-(a.brandBonus+a.numericBonus));
  activePairs.sort(sortPairs);
  knownPairs.sort(sortPairs);
  self.postMessage({type:'progress',pct:100});
  self.postMessage({type:'done',activePairs,knownPairs,allItems:items});
};
`;

let _matchActivePairs = [];
let _matchKnownPairs  = [];
let _matchAllItems    = [];

let _matchCurrentView = 'all';
let _matchWorker      = null;
let _matchWorkerUrl   = null;
let _matchPending     = null;

let _matchBgResult    = null;

let _matcherDisabledFiles = new Set();

function matcherFileChipsRender() {
  const panel = document.getElementById('matcherFilesPanel');
  const wrap  = document.getElementById('matcherFileChips');
  if (!panel || !wrap) return;

  const hasFiles = typeof allFilesData !== 'undefined' && allFilesData.length > 0;
  const hasJson = typeof jeDB !== 'undefined' && Object.keys(jeDB).length > 0;

  if (!hasFiles && !hasJson) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';

  if (typeof window._matcherUpdateJsonInfo === 'function') window._matcherUpdateJsonInfo();

  if (!hasFiles) {
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = allFilesData.map(f => {
    const off = _matcherDisabledFiles.has(f.fileName);
    const label = (f.fileName.length > 30 ? f.fileName.slice(0, 28) + '…' : f.fileName)
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeTitle = (f.fileName + (off ? ' — нажмите чтобы включить' : ' — нажмите чтобы отключить'))
      .replace(/"/g, '&quot;');
    const safeName = encodeURIComponent(f.fileName);
    return `<button class="btn btn-secondary${off ? '' : ' active'}" data-mf-name="${safeName}" title="${safeTitle}" style="height:28px;padding:3px 10px;font-size:var(--fz-sm);">📦 ${label}</button>`;
  }).join('');
}

function matcherToggleFile(fileName) {
  if (_matcherDisabledFiles.has(fileName)) {
    _matcherDisabledFiles.delete(fileName);
  } else {

    const enabledCount = (typeof allFilesData !== 'undefined' ? allFilesData.length : 0)
      - _matcherDisabledFiles.size - 1;
    if (enabledCount < 1) {
      showToast('Должен быть включён хотя бы один файл', 'warn');
      return;
    }
    _matcherDisabledFiles.add(fileName);
  }
  matcherFileChipsRender();

  if (typeof renderMatcherTable === 'function') renderMatcherTable();
}

// --- File filter chips (shown after analysis) ---
let _matcherHiddenFiles = new Set(); // files excluded from display (empty = show all)
let _matcherCatFilter = '';

function renderMatcherFileFilter() {
  const wrap = document.getElementById('matcherFilterChips');
  const container = document.getElementById('matcherFileFilter');
  if (!wrap || !container) return;

  // Collect unique file names from results
  const files = new Set();
  for (const p of _matchActivePairs) {
    if (p.file1) files.add(p.file1);
    if (p.file2) files.add(p.file2);
  }
  if (files.size <= 1) { container.style.display = 'none'; return; }
  container.style.display = 'flex';

  // Remove stale hidden file entries
  for (const f of _matcherHiddenFiles) { if (!files.has(f)) _matcherHiddenFiles.delete(f); }

  // Chip: active (highlighted) = shown in results; inactive = hidden
  wrap.innerHTML = Array.from(files).map(f => {
    const shown = !_matcherHiddenFiles.has(f);
    const label = (f.length > 30 ? f.slice(0, 28) + '…' : f).replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<button class="btn btn-secondary${shown ? ' active' : ''}" data-mfilter="${encodeURIComponent(f)}" style="height:26px;padding:2px 8px;font-size:11px;" title="${shown ? 'Скрыть пары с этим файлом' : 'Показать пары с этим файлом'}">${label}</button>`;
  }).join('');
}

document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-mfilter]');
  if (!btn) return;
  const f = decodeURIComponent(btn.dataset.mfilter);
  // Toggle: shown → hide, hidden → show
  if (_matcherHiddenFiles.has(f)) _matcherHiddenFiles.delete(f);
  else _matcherHiddenFiles.add(f);
  renderMatcherFileFilter();
  renderMatcherTable();
});

// --- Dirty warning when files change after analysis ---
function _matcherMarkDirty() {
  if (!_matchActivePairs || !_matchActivePairs.length) return;
  const warn = document.getElementById('matcherDirtyWarn');
  if (warn) warn.style.display = '';
}

// --- Category dropdown for matcher (mirrors monitor's buildCategoryDropdown) ---
function _buildMatcherCategoryFilter() {
  const sel = document.getElementById('matcherCatSelect');
  const row = document.getElementById('matcherCatRow');
  if (!sel || !_matchActivePairs.length) { if (row) row.style.display = 'none'; return; }

  // Build synonym→canonical map
  const synToCanon = new Map();
  if (typeof _brandDB !== 'undefined' && _brandDB) {
    Object.entries(_brandDB).forEach(([key, val]) => {
      const canon = key.toLowerCase();
      synToCanon.set(canon, canon);
      (val.synonyms || []).forEach(s => { if (s) synToCanon.set(s.toLowerCase(), canon); });
    });
  }

  const freq = {};
  const rePunct = /[«»""''()\[\]{}\/|.,;:!?@#$%^&*+=<>~`№—–\-]/g;
  const expanded = (typeof _catWordsExpanded !== 'undefined') ? _catWordsExpanded : new Set();

  for (const p of _matchActivePairs) {
    for (const nm of [p.name1, p.name2]) {
      if (!nm) continue;
      const seenCanons = new Set();
      nm.replace(rePunct, ' ').split(/\s+/).forEach(w => {
        const wl = w.toLowerCase().trim();
        if (wl.length < 3 || /^\d/.test(wl)) return;
        if (expanded.size > 0 && !expanded.has(wl)) return;
        const canon = synToCanon.get(wl) || wl;
        if (!seenCanons.has(canon)) { seenCanons.add(canon); freq[canon] = (freq[canon] || 0) + 1; }
      });
    }
  }

  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 80).map(([w]) => w);
  if (!top.length) { if (row) row.style.display = 'none'; return; }

  if (row) row.style.display = '';
  const prev = sel.value;
  sel.innerHTML = '<option value="">Категории</option>';
  top.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w; opt.textContent = w.charAt(0).toUpperCase() + w.slice(1);
    sel.appendChild(opt);
  });
  if (prev && top.includes(prev)) sel.value = prev;
  else if (prev) { _matcherCatFilter = ''; sel.value = ''; _resetMatcherCatStyle(sel); }
}

function _resetMatcherCatStyle(sel) {
  sel.style.background = 'var(--surface)'; sel.style.borderColor = 'var(--border-strong)';
  sel.style.color = 'var(--text-primary)'; sel.style.fontWeight = '';
}

// Category select change handler
(function() {
  const sel = document.getElementById('matcherCatSelect');
  if (!sel) return;
  sel.addEventListener('change', function() {
    _matcherCatFilter = this.value;
    if (_matcherCatFilter) {
      this.style.background = 'var(--accent-bg)'; this.style.borderColor = 'var(--accent)';
      this.style.color = 'var(--accent-dark)'; this.style.fontWeight = '600';
    } else {
      _resetMatcherCatStyle(this);
    }
    renderMatcherTable();
  });
})();


document.addEventListener('click', function(e) {
  const chip = e.target.closest('[data-mf-name]');
  if (!chip) return;
  matcherToggleFile(decodeURIComponent(chip.dataset.mfName));
});

document.addEventListener('visibilitychange', function() {
  if (!document.hidden && _matchBgResult) {
    const { activePairs, knownPairs, allItems, btn } = _matchBgResult;
    _matchBgResult = null;
    _matchActivePairs = activePairs;
    _matchKnownPairs  = knownPairs;
    _matchAllItems    = allItems || [];
    btn.disabled = false; btn.textContent = '▶ Запустить поиск';
    document.getElementById('matcherProgress').style.display = 'none';
    updateMatcherStats();
    setMatchView('all');
    document.getElementById('matcherStats').style.display = 'flex';
    document.getElementById('matcherSearchInp').disabled = false;
    const _msr3=document.getElementById('matcherSearchRow');if(_msr3)_msr3.style.display='';
    showToast('Поиск завершён в фоне: ' + _matchActivePairs.length + ' пар найдено', 'ok');
    if (typeof _pmScheduleSave === 'function') _pmScheduleSave();
  }
});

function getMatcherDB() {

  const chk = document.getElementById('matcherJsonEnabled');
  if (chk && !chk.checked) return {};

  return jeDB;
}

function getMatcherPriceFiles() {

  if (typeof allFilesData === 'undefined' || !allFilesData.length) return [];
  return allFilesData
    .filter(f => !_matcherDisabledFiles.has(f.fileName))
    .map(f => ({ name: f.fileName, data: f.data }));
}

function runMatcher() {
  const files = getMatcherPriceFiles();
  if (!files.length) {
    showToast('Сначала загрузите прайсы на вкладке «Мониторинг»', 'warn');
    return;
  }
  const btn = document.getElementById('matcherRunBtn');
  btn.disabled = true; btn.textContent = '⏳ Анализ...';

  document.getElementById('matcherProgress').style.display = '';
  document.getElementById('matcherProgressLbl').textContent = 'Анализирую прайсы...';
  document.getElementById('matcherProgressFill').style.width = '0%';
  document.getElementById('matcherStats').style.display = 'none';
  document.getElementById('matcherTableWrap').style.display = 'none';
  document.getElementById('matcherEmpty').style.display = 'none';
  const _dw = document.getElementById('matcherDirtyWarn'); if (_dw) _dw.style.display = 'none';
  const _mff = document.getElementById('matcherFileFilter'); if (_mff) _mff.style.display = 'none';
  const _msr = document.getElementById('matcherSearchRow'); if (_msr) _msr.style.display = 'none';
  const _mcr = document.getElementById('matcherCatRow'); if (_mcr) _mcr.style.display = 'none';
  const _mcs = document.getElementById('matcherCatSelect'); if (_mcs) { _mcs.innerHTML = '<option value="">Категории</option>'; _mcs.value = ''; if (typeof _resetMatcherCatStyle === 'function') _resetMatcherCatStyle(_mcs); }
  if (typeof _matcherHiddenFiles !== 'undefined') _matcherHiddenFiles.clear();
  if (typeof _matcherCatFilter !== 'undefined') _matcherCatFilter = '';

  _matchActivePairs = []; _matchKnownPairs = [];

  if (_matchWorker) _matchWorker.terminate();
  if (_matchWorkerUrl) URL.revokeObjectURL(_matchWorkerUrl);
  const blob = new Blob([MATCHER_WORKER_SRC], { type: 'application/javascript' });
  _matchWorkerUrl = URL.createObjectURL(blob);
  _matchWorker = new Worker(_matchWorkerUrl);

  _matchWorker.onmessage = function({ data }) {
    if (data.type === 'progress') {
      if (!document.hidden) {
        document.getElementById('matcherProgressFill').style.width = data.pct + '%';
      }
    } else if (data.type === 'done') {
      if (document.hidden) {

        _matchBgResult = { activePairs: data.activePairs, knownPairs: data.knownPairs, allItems: data.allItems || [], btn };
      } else {
        _matchActivePairs = data.activePairs;
        _matchKnownPairs  = data.knownPairs;
        _matchAllItems    = data.allItems || [];
        btn.disabled = false; btn.textContent = '▶ Запустить поиск';
        document.getElementById('matcherProgress').style.display = 'none';
        updateMatcherStats();
        setMatchView('all');
        document.getElementById('matcherStats').style.display = 'flex';
        document.getElementById('matcherSearchInp').disabled = false;
        const _msr2=document.getElementById('matcherSearchRow');if(_msr2)_msr2.style.display='';
        showToast('Поиск завершён: ' + _matchActivePairs.length + ' пар найдено', 'ok');
        if (typeof _pmScheduleSave === 'function') _pmScheduleSave();
      }
    }
  };
  _matchWorker.onerror = err => {
    btn.disabled = false; btn.textContent = '▶ Запустить поиск';
    document.getElementById('matcherProgress').style.display = 'none';
    showToast('Ошибка поиска: ' + err.message, 'err');
  };

  const db = getMatcherDB();
  const brandDB = typeof _brandDB !== 'undefined' ? _brandDB : {};
  _matchWorker.postMessage({ type: 'run', db, priceFiles: files, brandDB });
}

function updateMatcherStats() {
  const active = _matchActivePairs;
  document.getElementById('ms-all').textContent      = active.filter(p => p.sim >= 55).length;
  document.getElementById('ms-high').textContent     = active.filter(p => p.sim >= 80).length;
  document.getElementById('ms-mid').textContent      = active.filter(p => p.sim >= 55 && p.sim < 80).length;
  renderMatcherFileFilter();
  _buildMatcherCategoryFilter();
}

function setMatchView(v) {
  _matchCurrentView = v;
  document.querySelectorAll('.mstat').forEach(s => s.classList.toggle('active', s.dataset.mv === v));
  renderMatcherTable();
}

function getMatchViewList() {
  if (_matchCurrentView === 'high')     return _matchActivePairs.filter(p => p.sim >= 80);
  if (_matchCurrentView === 'mid')      return _matchActivePairs.filter(p => p.sim >= 55 && p.sim < 80);
  return _matchActivePairs.filter(p => p.sim >= 55);
}

let _matchRenderedPairs = [];

function renderMatcherTable(preserveScroll) {
  const q = (document.getElementById('matcherSearchInp').value || '').toLowerCase().trim();
  const wrap = document.getElementById('matcherTableWrap');
  const empty = document.getElementById('matcherEmpty');

  let list = getMatchViewList().slice();

  // File visibility filter (hidden files excluded)
  if (_matcherHiddenFiles.size > 0) {
    list = list.filter(r => !_matcherHiddenFiles.has(r.file1) && !_matcherHiddenFiles.has(r.file2));
  }

  if (_matcherDisabledFiles.size > 0) {
    list = list.filter(r =>
      !_matcherDisabledFiles.has(r.file1) && !_matcherDisabledFiles.has(r.file2)
    );
  }

  // Category filter
  if (_matcherCatFilter) {
    const _cf = _matcherCatFilter.toLowerCase();
    const _cfWords = (typeof window._pmGetCategoryWords === 'function')
      ? window._pmGetCategoryWords(_cf)
      : new Set([_cf]);
    const rePunct = /[«»""''()\[\]{}\/|.,;:!?@#$%^&*+=<>~`№—–\-]/g;
    list = list.filter(r => {
      for (const nm of [r.name1, r.name2]) {
        if (!nm) continue;
        const words = nm.toLowerCase().replace(rePunct, ' ').split(/\s+/);
        if (words.some(w => _cfWords.has(w))) return true;
      }
      return false;
    });
  }

  // Text search with brand synonym expansion
  if (q) {
    const _sqWords = new Set([q]);
    try {
      if (typeof _brandDB !== 'undefined' && _brandDB) {
        Object.entries(_brandDB).forEach(function([key, val]) {
          const canon = key.toLowerCase();
          const syns = (val.synonyms || []).map(s => s.toLowerCase()).filter(Boolean);
          if (canon === q || canon.includes(q) || q.includes(canon) ||
              syns.some(s => s === q || s.includes(q) || q.includes(s))) {
            _sqWords.add(canon);
            syns.forEach(s => _sqWords.add(s));
          }
        });
      }
    } catch(e) {}
    const _sqArr = [..._sqWords];
    list = list.filter(r => {
      const n1 = (r.name1||'').toLowerCase(), n2 = (r.name2||'').toLowerCase();
      const b1 = (r.bc1||''), b2 = (r.bc2||'');
      const f1 = (r.file1||'').toLowerCase(), f2 = (r.file2||'').toLowerCase();
      return _sqArr.some(w => n1.includes(w) || n2.includes(w)) ||
             b1.includes(q) || b2.includes(q) ||
             f1.includes(q) || f2.includes(q);
    });
  }

  _matchRenderedPairs = list;

  if (!list.length) {
    wrap.style.display = 'none'; empty.style.display = '';
    var _eh3 = empty.querySelector('h3'), _ep = empty.querySelector('p');
    if (_eh3) _eh3.textContent = 'Нет совпадений';
    if (_ep) _ep.textContent = q ? 'Попробуйте изменить поисковый запрос' : 'Нажмите «Запустить поиск» для поиска похожих товаров';
    return;
  }
  wrap.style.display = ''; empty.style.display = 'none';

  const PAIR_H = 74;

  const OVERSCAN = 8;

  function _mvsRenderMatcherRows() {
    const scrollTop = wrap.scrollTop;
    const viewH = wrap.clientHeight || 500;
    const total = list.length;
    const start = Math.max(0, Math.floor(scrollTop / PAIR_H) - OVERSCAN);
    const end   = Math.min(total, Math.ceil((scrollTop + viewH) / PAIR_H) + OVERSCAN);
    const topPad = start * PAIR_H;
    const botPad = Math.max(0, (total - end)) * PAIR_H;
    const view = _matchCurrentView;
    let html = '';
    if (topPad > 0) html += `<tr class="mvs-spacer-row" style="height:${topPad}px"><td colspan="5"></td></tr>`;
    for (let i = start; i < end; i++) {
      const r = list[i];
      const sc = r.sim;
      const cls = sc >= 80 ? 'm-score-hi' : sc >= 55 ? 'm-score-mid' : 'm-score-lo';
      const rowAttr = ` data-mrow="${i}" data-mview="${view}" style="cursor:pointer"`;
      const pairBg = r._confirmed ? 'background:#D1FAE5;' : (i % 2 === 1 ? 'background:#F4F5F7;' : '');
      let tag;
      tag = r.aInDB && r.bInDB && r.aKey !== r.bKey
        ? '<span class="m-tag m-tag-mrg" title="Объединить группы">🔀</span>'
        : r.aInDB || r.bInDB
          ? '<span class="m-tag m-tag-syn">кросскод</span>'
          : '<span class="m-tag m-tag-new">новое</span>';
      html += `<tr class="mp-a"${rowAttr} style="cursor:pointer;${pairBg}">
        <td rowspan="2" class="${cls}" style="text-align:center;vertical-align:middle;width:46px;${pairBg}">${sc}%</td>
        <td style="${pairBg}"><span class="src-lbl">${esc(r.file1)}</span></td>
        <td style="${pairBg}">${esc(r.name1)}</td>
        <td style="font-family:Inter,sans-serif;font-size:11px;${pairBg}">${esc(r.bc1)}</td>
        <td rowspan="2" style="text-align:center;vertical-align:middle;width:60px;${pairBg}">${tag}</td>
      </tr><tr class="mp-b"${rowAttr} style="${pairBg}">
        <td style="${pairBg}"><span class="src-lbl">${esc(r.file2)}</span></td>
        <td style="${pairBg}">${esc(r.name2)}</td>
        <td style="font-family:Inter,sans-serif;font-size:11px;${pairBg}">${esc(r.bc2)}</td>
      </tr>`;
    }
    if (botPad > 0) html += `<tr class="mvs-spacer-row" style="height:${botPad}px"><td colspan="5"></td></tr>`;
    document.getElementById('matcherTbody').innerHTML = html;
  }

  if (!wrap._mvsScrollAttached) {
    wrap._mvsScrollAttached = true;
    wrap.addEventListener('scroll', function() {
      if (!wrap._mvsTicking) {
        wrap._mvsTicking = true;
        requestAnimationFrame(function() { if (wrap._mvsRender) wrap._mvsRender(); wrap._mvsTicking = false; });
      }
    }, { passive: true });
  }

  wrap._mvsRender = _mvsRenderMatcherRows;
  const _savedMatchScroll = preserveScroll ? wrap.scrollTop : 0;
  if (!preserveScroll) wrap.scrollTop = 0;
  _mvsRenderMatcherRows();
  if (preserveScroll && _savedMatchScroll > 0) {
    requestAnimationFrame(() => { wrap.scrollTop = _savedMatchScroll; });
  }
}

document.getElementById('matcherTbody').addEventListener('click', function(e) {
  const openBtn = e.target.closest('[data-openm]');
  if (openBtn) {
    e.stopPropagation();
    openMatchModal(+openBtn.dataset.openm, openBtn.dataset.mview);
    return;
  }
  const row = e.target.closest('tr[data-mrow]');
  if (row && !e.target.closest('button')) {
    openMatchModal(+row.dataset.mrow, row.dataset.mview);
  }
});

document.getElementById('matcherSearchInp').addEventListener('input', renderMatcherTable);

document.querySelectorAll('.mstat[data-mv]').forEach(s =>
  s.addEventListener('click', () => setMatchView(s.dataset.mv)));

document.getElementById('matcherRunBtn').addEventListener('click', runMatcher);




function mcSwitchTab(tab) {
  const isSyn = (tab === 'syn');
  document.getElementById('mcPaneSyn').style.display   = isSyn ? '' : 'none';
  document.getElementById('mcPaneBrand').style.display = isSyn ? 'none' : '';
  const mcOkBtn  = document.getElementById('mcOkBtn');
  const mcbSave  = document.getElementById('mcbSaveBtn');
  if (mcOkBtn)  mcOkBtn.style.display  = isSyn ? '' : 'none';
  if (mcbSave)  mcbSave.style.display  = isSyn ? 'none' : '';
  const tSyn   = document.getElementById('mcTabSyn');
  const tBrand = document.getElementById('mcTabBrand');
  if (tSyn)   tSyn.classList.toggle('inactive',   !isSyn);
  if (tBrand) tBrand.classList.toggle('inactive',  isSyn);
}

function mcbFillFromPair(name1, name2, src1, src2) {

  const p1 = document.getElementById('mcbPreviewSrc1');
  const p2 = document.getElementById('mcbPreviewSrc2');
  const n1 = document.getElementById('mcbPreviewName1');
  const n2 = document.getElementById('mcbPreviewName2');
  if (p1) p1.textContent = src1 || 'Источник 1';
  if (p2) p2.textContent = src2 || 'Источник 2';
  if (n1) n1.textContent = name1 || '';
  if (n2) n2.textContent = name2 || '';

  function extractWords(name) {
    if (!name) return [];
    return [...new Set(
      name.toLowerCase()
        .replace(/[^a-zA-Zа-яёА-ЯЁ0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(function(w) { return w.length >= 2 && !/^\d+$/.test(w); })
    )];
  }

  const words1 = extractWords(name1);
  const words2 = extractWords(name2);
  const allWords = [...new Set(words1.concat(words2))];

  function getFieldWords(id) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) return [];
    return el.value.split(',').map(s => brandNormKey(s)).filter(Boolean);
  }
  function getFieldSet(id) { return new Set(getFieldWords(id)); }

  function setStatus(msg, isError) {
    const el = document.getElementById('mcbStatus');
    if (!el) return;
    el.innerHTML = msg
      ? `<span style="color:${isError ? 'var(--red)' : 'var(--green)'}">${msg}</span>`
      : '';
    if (msg) setTimeout(function(){ if (el.innerHTML.includes(msg.slice(0,10))) el.innerHTML = ''; }, 3000);
  }

  function validateAdd(word, targetId) {
    const w = brandNormKey(word);
    if (!w) return null;
    const canonEl = document.getElementById('mcbCanon');
    const canonVal = canonEl ? brandNormKey(canonEl.value) : '';

    if (targetId === 'mcbCanon') {

      if (getFieldSet('mcbSyns').has(w)) return `«${w}» уже в кросскодах`;
      if (getFieldSet('mcbAnti').has(w)) return `«${w}» уже в антонимах`;

      // soft warn only — don't block
    }

    if (targetId === 'mcbSyns') {

      if (canonVal && w === canonVal) return `«${w}» уже выбран как канонический`;

      if (getFieldSet('mcbAnti').has(w)) return `«${w}» уже в антонимах — конфликт`;

      // soft warn only for cross-brand antonym — don't block
    }

    if (targetId === 'mcbAnti') {

      if (canonVal && w === canonVal) return `«${w}» уже выбран как канонический`;

      if (getFieldSet('mcbSyns').has(w)) return `«${w}» уже в кросскодах — конфликт`;
    }

    return null;
  }

  function warnAdd(word, targetId) {
    const w = brandNormKey(word);
    if (!w) return null;
    if (targetId === 'mcbCanon') {
      for (const [key, val] of Object.entries(_brandDB || {})) {
        if ((val.synonyms || []).map(brandNormKey).includes(w) && key !== w)
          return `«${w}» уже является кросскодом бренда «${key}»`;
      }
    }
    if (targetId === 'mcbSyns') {
      for (const [key, val] of Object.entries(_brandDB || {})) {
        if ((val.antonyms || []).map(brandNormKey).includes(w))
          return `«${w}» является антонимом бренда «${key}»`;
      }
    }
    return null;
  }

  function renderPills(containerId, targetInputId, isAnti) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!allWords.length) { container.style.display = 'none'; return; }
    container.style.display = '';
    allWords.forEach(function(w) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brand-word-pill' + (isAnti ? ' pill--anti' : '');
      btn.textContent = w;
      btn.dataset.word = w;
      btn.addEventListener('click', function() {
        const inp = document.getElementById(targetInputId);
        if (!inp) return;
        const wNorm = brandNormKey(w);
        const cur = inp.value.trim();
        const parts = cur ? cur.split(',').map(s => s.trim()).filter(Boolean) : [];
        const idx = parts.findIndex(p => brandNormKey(p) === wNorm);

        if (idx !== -1) {

          parts.splice(idx, 1);
          inp.value = parts.join(', ');
          setStatus('');
        } else {

          const err = validateAdd(w, targetInputId);
          if (err) {
            setStatus('⚠ ' + err, true);
            return;
          }
          parts.push(w);
          inp.value = parts.join(', ');
          // soft warn — show but don't block
          const warn = warnAdd(w, targetInputId);
          setStatus(warn ? '⚠ ' + warn : '', !!warn);
        }
        mcbMarkUsedPills();
      });
      container.appendChild(btn);
    });
  }

  renderPills('mcbPillsCanon', 'mcbCanon', false);
  renderPills('mcbPillsSyns',  'mcbSyns',  false);
  renderPills('mcbPillsAnti',  'mcbAnti',  true);

  mcbMarkUsedPills();
}

function mcbMarkUsedPills() {
  const usedSets = {
    mcbCanon: new Set(),
    mcbSyns:  new Set(),
    mcbAnti:  new Set()
  };
  for (const id of Object.keys(usedSets)) {
    const el = document.getElementById(id);
    if (el && el.value.trim()) {
      el.value.split(',').forEach(s => {
        const n = brandNormKey(s);
        if (n) usedSets[id].add(n);
      });
    }
  }

  const pillMap = [
    { cid: 'mcbPillsCanon', fieldId: 'mcbCanon' },
    { cid: 'mcbPillsSyns',  fieldId: 'mcbSyns' },
    { cid: 'mcbPillsAnti',  fieldId: 'mcbAnti' }
  ];
  pillMap.forEach(function({ cid, fieldId }) {
    const cont = document.getElementById(cid);
    if (!cont) return;
    cont.querySelectorAll('.brand-word-pill').forEach(function(btn) {
      const w = brandNormKey(btn.dataset.word);
      if (usedSets[fieldId].has(w)) {
        btn.classList.add('pill--used');
      } else {
        btn.classList.remove('pill--used');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {

  ['mcbCanon','mcbSyns','mcbAnti'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', function() {
      mcbMarkUsedPills();

      const st = document.getElementById('mcbStatus');
      if (st) st.innerHTML = '';
    });
  });

  const mcbSaveBtn = document.getElementById('mcbSaveBtn');
  if (mcbSaveBtn) {
    mcbSaveBtn.addEventListener('click', function() {
      const elCanon  = document.getElementById('mcbCanon');
      const elSyns   = document.getElementById('mcbSyns');
      const elAnti   = document.getElementById('mcbAnti');
      const elStatus = document.getElementById('mcbStatus');
      const elBanner = document.getElementById('mcbConflictBanner');
      if (elBanner) { elBanner.style.display = 'none'; elBanner.textContent = ''; }

      let canon = brandNormKey(elCanon.value);
      if (!canon) {
        if (elStatus) elStatus.innerHTML = '<span style="color:var(--red);">⚠ Введите канонический бренд</span>';
        return;
      }
      let syns = (elSyns.value || '').split(',').map(s => brandNormKey(s)).filter(Boolean);
      let anti = (elAnti.value || '').split(',').map(s => brandNormKey(s)).filter(Boolean);

      const check = brandCheckConflicts(canon, syns, anti, null);

      if (check.conflicts.length) {
        const msg = '⚠ ' + check.conflicts.join(' · ');
        if (elStatus) elStatus.innerHTML = `<span style="color:var(--red);">${msg}</span>`;
        if (elBanner) { elBanner.textContent = msg; elBanner.style.display = ''; }
        return;
      }

      if (check.warnings.length && elBanner) {
        elBanner.textContent = 'ℹ ' + check.warnings.join(' · ');
        elBanner.style.background = 'var(--accent-lite)';
        elBanner.style.borderColor = 'var(--accent)';
        elBanner.style.color = 'var(--accent-dark)';
        elBanner.style.display = '';
      }

      if (_brandDB[canon]) {
        let ex = _brandDB[canon];
        const mergedSyns = Array.from(new Set((ex.synonyms || []).concat(syns)));
        const mergedAnti = Array.from(new Set((ex.antonyms || []).concat(anti)));
        const mergedConflict = mergedSyns.filter(s => mergedAnti.includes(s));
        if (mergedConflict.length) {
          const msg = `⚠ Противоречие: «${mergedConflict[0]}» в синонимах и антонимах`;
          if (elStatus) elStatus.innerHTML = `<span style="color:var(--red);">${msg}</span>`;
          if (elBanner) { elBanner.textContent = msg; elBanner.style.display = ''; }
          return;
        }
        _brandDB[canon] = { synonyms: mergedSyns, antonyms: mergedAnti };
      } else {
        _brandDB[canon] = { synonyms: syns, antonyms: anti };
      }
      brandRender();
      brandMarkUnsaved();
      showToast('Бренд «' + canon + '» сохранён', 'ok');
      if (elStatus) { elStatus.innerHTML = '<span style="color:var(--green);">✓ Сохранён</span>'; setTimeout(function(){ elStatus.innerHTML = ''; }, 2500); }
      elCanon.value = ''; elSyns.value = ''; elAnti.value = '';
      if (elBanner) { elBanner.style.display = 'none'; elBanner.textContent = ''; }
      mcbMarkUsedPills();
    });
  }
});

function openMatchModal(i, view) {

  const r = _matchRenderedPairs[i];
  if (!r) return;

  const bc2key = new Map();
  for (const [key, val] of Object.entries(jeDB)) {
    bc2key.set(key, key);
    if (Array.isArray(val)) val.slice(1).forEach(s => { s = String(s).trim(); if (s) bc2key.set(s, key); });
  }
  r.aInDB = bc2key.has(r.bc1); r.aKey = bc2key.get(r.bc1);
  r.bInDB = bc2key.has(r.bc2); r.bKey = bc2key.get(r.bc2);

  _matchPending = { pair: r, renderedIdx: i, view };

  const sc = r.sim;
  const col = sc >= 85 ? 'var(--green-dark)' : sc >= 60 ? 'var(--amber-dark)' : 'var(--red)';
  document.getElementById('mcScore').innerHTML = `<span style="color:${col}">${sc}%</span>`;
  document.getElementById('mc-src1').textContent  = r.file1;
  document.getElementById('mc-name1').textContent = r.name1;
  document.getElementById('mc-bc1').textContent   = r.bc1;
  document.getElementById('mc-src2').textContent  = r.file2;
  document.getElementById('mc-name2').textContent = r.name2;
  document.getElementById('mc-bc2').textContent   = r.bc2;

  const isReadOnly = r.aInDB && r.bInDB && r.aKey === r.bKey;
  let action = '';
  if (isReadOnly) action = `Уже в одной группе (главный ШК: «${r.aKey}»)`;
  else if (r.aInDB && r.bInDB && r.aKey !== r.bKey) action = `Объединить группы «${r.aKey}» и «${r.bKey}» → один кросскод`;
  else if (!r.aInDB && r.bInDB) action = `Добавить «${r.bc1}» как кросскод к группе «${r.bKey}»`;
  else if (r.aInDB && !r.bInDB) action = `Добавить «${r.bc2}» как кросскод к группе «${r.aKey}»`;
  else action = `Создать новую группу: главный «${r.bc1}», кросскод «${r.bc2}»`;

  document.getElementById('mcAction').textContent = action;
  document.getElementById('mcOkBtn').style.display = isReadOnly ? 'none' : '';
  document.getElementById('mcOkBtn').textContent = 'Подтвердить';

  mcSwitchTab('syn');
  ['mcbCanon','mcbSyns','mcbAnti'].forEach(function(id) {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const mcbStatus = document.getElementById('mcbStatus'); if (mcbStatus) mcbStatus.textContent = '';

  mcbFillFromPair(r.name1 || '', r.name2 || '', r.file1 || '', r.file2 || '');
  document.getElementById('matchConfirmModal').style.display = 'flex';
}

function closeMatchModal() {
  document.getElementById('matchConfirmModal').style.display = 'none';
  _matchPending = null;
}

function applyMatchPair(r) {

  const bc2key = new Map();
  for (const [key, val] of Object.entries(jeDB)) {
    bc2key.set(String(key), String(key));
    if (Array.isArray(val)) val.slice(1).forEach(s => { s = String(s).trim(); if (s) bc2key.set(s, String(key)); });
  }
  const bc1 = String(r.bc1).trim(), bc2 = String(r.bc2).trim();
  const name1 = String(r.name1 || bc1), name2 = String(r.name2 || bc2);
  const aInDB = bc2key.has(bc1), bInDB = bc2key.has(bc2);
  const aKey = bc2key.get(bc1), bKey = bc2key.get(bc2);

  jeDBSaveHistory();

  if (aInDB && bInDB && aKey !== bKey) {

    const a1 = Array.isArray(jeDB[aKey]) ? jeDB[aKey] : [String(aKey)];
    const a2 = Array.isArray(jeDB[bKey]) ? jeDB[bKey] : [String(bKey)];
    const synSet = new Set();

    a1.slice(1).forEach(s => { s = String(s).trim(); if (s && s !== aKey) synSet.add(s); });
    synSet.add(bKey);
    a2.slice(1).forEach(s => { s = String(s).trim(); if (s && s !== aKey) synSet.add(s); });
    jeDB[aKey] = [a1[0] || a2[0] || aKey, ...synSet];
    delete jeDB[bKey];
  } else if (!aInDB && bInDB) {

    const arr = jeDB[bKey];
    if (Array.isArray(arr)) {
      if (!arr.map(s=>String(s).trim()).slice(1).includes(bc1)) arr.push(bc1);
    } else {
      jeDB[bKey] = [name2, bc1];
    }
  } else if (aInDB && !bInDB) {

    const arr = jeDB[aKey];
    if (Array.isArray(arr)) {
      if (!arr.map(s=>String(s).trim()).slice(1).includes(bc2)) arr.push(bc2);
    } else {
      jeDB[aKey] = [name1, bc2];
    }
  } else {

    if (!jeDB[bc1]) {
      jeDB[bc1] = [name1, bc2];
    } else {

      const arr = jeDB[bc1];
      if (!arr.map(s=>String(s).trim()).slice(1).includes(bc2)) arr.push(bc2);
    }
  }
  jeDBNotifyChange();
}

function confirmMatchAction() {
  if (!_matchPending) return;
  const { pair, view } = _matchPending;
  if (!pair) return;

  const bc2key = new Map();
  for (const [key, val] of Object.entries(jeDB)) {
    bc2key.set(key, key);
    if (Array.isArray(val)) val.slice(1).forEach(s => { s = String(s).trim(); if (s) bc2key.set(s, key); });
  }
  pair.aInDB = bc2key.has(pair.bc1); pair.aKey = bc2key.get(pair.bc1);
  pair.bInDB = bc2key.has(pair.bc2); pair.bKey = bc2key.get(pair.bc2);

  if (pair.aInDB && pair.bInDB && pair.aKey === pair.bKey) {

    closeMatchModal();
    showToast('Эти товары уже в одной группе', 'info');
    return;
  }

  // Mark confirmed green BEFORE applyMatchPair so updateMatchPairTags keeps it visible
  pair._confirmed = true;

  applyMatchPair(pair);
  // Explicit unsaved mark — belt-and-suspenders (jeDBNotifyChange already calls it)
  if (typeof unifiedMarkUnsaved === 'function') unifiedMarkUnsaved(true);
  jeRenderEditor(true);
  // ── HISTORY HOOK ──
  if (typeof window._matchHistoryAdd === 'function') window._matchHistoryAdd('ok', pair);

  updateMatcherStats();
  clearTimeout(rebuildBarcodeAliasFromJeDB._t);
  rebuildBarcodeAliasFromJeDB._t = setTimeout(function() { if (typeof allFilesData !== 'undefined' && allFilesData.length > 0) { processData(); renderTable(true); updateUI(); } }, 120);
  closeMatchModal();
  renderMatcherTable(true);
  showToast('Добавлено в базу кросскодов', 'ok');
}

function updateMatchPairTags() {
  const bc2key = new Map();
  for (const [key, val] of Object.entries(jeDB)) {
    bc2key.set(String(key), String(key));
    if (Array.isArray(val)) val.slice(1).forEach(s => { s = String(s).trim(); if (s) bc2key.set(s, String(key)); });
  }

  const still = [], newKnown = [];
  for (const r of _matchActivePairs) {
    r.aInDB = bc2key.has(String(r.bc1)); r.aKey = bc2key.get(String(r.bc1));
    r.bInDB = bc2key.has(String(r.bc2)); r.bKey = bc2key.get(String(r.bc2));
    // Keep _confirmed pairs visible (green rows) even if now in DB
    if (!r._confirmed && r.aInDB && r.bInDB && r.aKey === r.bKey) newKnown.push(r); else still.push(r);
  }
  _matchActivePairs.length = 0; for (var _i=0;_i<still.length;_i++) _matchActivePairs.push(still[_i]);

  for (var _j=0;_j<newKnown.length;_j++) _matchKnownPairs.push(newKnown[_j]);

  for (const r of _matchKnownPairs) {
    r.aInDB = bc2key.has(String(r.bc1)); r.aKey = bc2key.get(String(r.bc1));
    r.bInDB = bc2key.has(String(r.bc2)); r.bKey = bc2key.get(String(r.bc2));
  }
  updateMatcherStats();
  if (document.querySelector('.nav-tab[data-pane="matcher"].active')) renderMatcherTable(true);
}

let jeDB = {};
let jeChanges = 0;
const JE_HISTORY_LIMIT = 50;
let jeUndoStack = [], jeRedoStack = [];
let _jeDupsCache = null;
let _jeVsKeys = [];
let _jeVsKeyIndex = new Map();

const JE_VS = { ROW_H: 40, OVERSCAN: 20, start: 0, end: 0, ticking: false };
const JE_VS_THRESHOLD = 100;

function jeDBSaveHistory() {
  jeUndoStack.push(JSON.stringify(jeDB));
  if (jeUndoStack.length > JE_HISTORY_LIMIT) jeUndoStack.shift();
  jeRedoStack = []; jeUpdateUndoUI();
}
function jeUndo() {
  if (!jeUndoStack.length) return;
  jeRedoStack.push(JSON.stringify(jeDB));
  jeDB = JSON.parse(jeUndoStack.pop());
  _jeDupsCache = null; jeChanges = Math.max(0, jeChanges - 1);
  jeUpdateUndoUI(); jeDBNotifyChange(false); jeRenderEditor(true);

  showToast('Отменено ↩', 'info');
}
function jeRedo() {
  if (!jeRedoStack.length) return;
  jeUndoStack.push(JSON.stringify(jeDB));
  jeDB = JSON.parse(jeRedoStack.pop());
  _jeDupsCache = null; jeChanges++;
  jeUpdateUndoUI(); jeDBNotifyChange(false); jeRenderEditor(true);

  showToast('Повторено ↪', 'info');
}
function jeUpdateUndoUI() {
  document.getElementById('jeUndoBtn').disabled = !jeUndoStack.length;
  document.getElementById('jeRedoBtn').disabled = !jeRedoStack.length;
}
function jeDBNotifyChange(bump) {
  _jeDupsCache = null;
  if (bump !== false) jeChanges++;
  unifiedMarkUnsaved(true);
  jeUpdateStatus();
  rebuildBarcodeAliasFromJeDB(true);
  updateMatchPairTags();
  if (typeof window._matcherUpdateJsonInfo === 'function') window._matcherUpdateJsonInfo();

  if (typeof window._pmScheduleSave === 'function') window._pmScheduleSave();
}
function jeUpdateStatus() {
  const n = Object.keys(jeDB).length;
  let synTotal = 0;
  for (const v of Object.values(jeDB)) if (Array.isArray(v)) synTotal += Math.max(0, v.length - 1);
  document.getElementById('jeStatus').textContent = `Наименований: ${n}  |  Кросскодов: ${synTotal}  |  Показано: ${_jeVsKeys.length}`;
  document.getElementById('jeExportXlsxBtn').disabled = !n;
  document.getElementById('jeClearBtn').disabled = !n;
  document.getElementById('jeSearchInp').disabled = !n;
  const dups = jeFindDuplicates();
  const dc = dups.size;
  const dupEl = document.getElementById('jeDupStatus');
  if (dc > 0) { dupEl.textContent = `⚠️ Дублей: ${dc}`; dupEl.style.display = ''; }
  else dupEl.style.display = 'none';

  const hasData = n > 0;
  document.getElementById('jeTable').style.display = hasData ? '' : 'none';
  document.getElementById('jeEmpty').style.display = hasData ? 'none' : '';
  const jeStatusRow = document.getElementById('jeStatusRow');
  const jeSearchRow = document.getElementById('jeSearchRow');
  if (jeStatusRow) jeStatusRow.style.display = hasData ? 'flex' : 'none';
  if (jeSearchRow) jeSearchRow.style.display = hasData ? '' : 'none';
}
function jeFindDuplicates() {
  if (_jeDupsCache) return _jeDupsCache;
  const seen = new Map();
  for (const [key, val] of Object.entries(jeDB)) {
    seen.set(key, (seen.get(key)||0)+1);
    if (Array.isArray(val)) for (let i = 1; i < val.length; i++) {
      const s = String(val[i]).trim(); if (!s) continue;
      seen.set(s, (seen.get(s)||0)+1);
    }
  }
  const dups = new Set();
  for (const [bc, cnt] of seen) if (cnt > 1) dups.add(bc);
  _jeDupsCache = dups; return dups;
}
function jeGetAllBarcodes() {
  const all = new Set();
  for (const [key, val] of Object.entries(jeDB)) {
    all.add(key);
    if (Array.isArray(val)) val.slice(1).forEach(s => { s = String(s).trim(); if (s) all.add(s); });
  }
  return all;
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escv(s) { return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function jeSafeId(s) { try { return btoa(unescape(encodeURIComponent(s))).replace(/=/g,''); } catch { return String(s).replace(/\W/g,'_'); } }

function jeBuildEditorRow(key, absIdx, dups) {
  const val = jeDB[key] || [];
  const name = val[0] || '';

  const pillsHtml = val.slice(1).reduce((acc, syn, i) => {
    const s = String(syn).trim();
    if (!s) return acc;
    const isDup = dups.has(s);
    const wCls = isDup ? 'syn-wrap dup' : 'syn-wrap';
    return acc + `<span class="${wCls}"><span class="syn-pill" title="${escv(s)}">${esc(s)}</span><span class="syn-x" data-key="${escv(key)}" data-si="${i + 1}" role="button" title="Удалить кросскод">×</span></span>`;
  }, '');
  return `<tr id="jer-${jeSafeId(key)}">
    <td style="text-align:center;color:var(--text-muted);font-size:11px;width:36px;">${absIdx+1}</td>
    <td><input class="je-inp-cell" value="${escv(name)}" data-namekey="${escv(key)}" style="min-width:140px;width:100%;"></td>
    <td><input class="je-inp-cell mono${dups.has(key)?' dup-inp':''}" value="${escv(key)}" data-origkey="${escv(key)}" style="font-family:Inter,sans-serif;width:100%;"></td>
    <td><div class="syn-cell">${pillsHtml}<input class="inp-add-syn" placeholder="+ ШК" data-key="${escv(key)}" title="Enter для добавления"></div></td>
    <td><button class="je-del-btn" data-delkey="${escv(key)}" title="Удалить группу">🗑</button></td>
  </tr>`;
}

function jeRenderVS() {
  const wrap = document.getElementById('jeTableWrap');
  if (!wrap) return;
  const total = _jeVsKeys.length;
  const scrollTop = wrap.scrollTop;
  const viewH = wrap.clientHeight || 500;

  if (total * JE_VS.ROW_H <= viewH + JE_VS.ROW_H * 2 || total <= JE_VS_THRESHOLD) {
    JE_VS.start = 0;
    JE_VS.end = total;
  } else {
    JE_VS.start = Math.max(0, Math.floor(scrollTop / JE_VS.ROW_H) - JE_VS.OVERSCAN);
    JE_VS.end = Math.min(total, Math.ceil((scrollTop + viewH) / JE_VS.ROW_H) + JE_VS.OVERSCAN);
  }
  const topPad = JE_VS.start * JE_VS.ROW_H;
  const botPad = Math.max(0, total - JE_VS.end) * JE_VS.ROW_H;
  const dups = jeFindDuplicates();
  const rows = _jeVsKeys.slice(JE_VS.start, JE_VS.end).map((key, rel) => jeBuildEditorRow(key, JE_VS.start + rel, dups)).join('');
  document.getElementById('jeTbody').innerHTML =
    (topPad > 0 ? `<tr style="pointer-events:none;"><td colspan="5" style="height:${topPad}px;padding:0;border:none;"></td></tr>` : '') +
    rows +
    (botPad > 0 ? `<tr style="pointer-events:none;"><td colspan="5" style="height:${botPad}px;padding:0;border:none;"></td></tr>` : '');
}

function jePatchRow(key) { jePatchRowSafe(key); }

function jeRenderEditor(preserveScroll = false) {
  const query = (document.getElementById('jeSearchInp').value||'').toLowerCase().trim();
  const keys = Object.keys(jeDB).sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
  _jeVsKeys = keys.filter(k => {
    if (!query) return true;
    const v = jeDB[k] || [];
    return k.includes(query) || (v[0]||'').toLowerCase().includes(query) || v.slice(1).join(' ').toLowerCase().includes(query);
  });
  _jeVsKeyIndex.clear();
  _jeVsKeys.forEach((k, i) => _jeVsKeyIndex.set(k, i));
  const wrap = document.getElementById('jeTableWrap');
  const _savedJeScroll = (preserveScroll && wrap) ? wrap.scrollTop : 0;
  if (wrap && !preserveScroll) wrap.scrollTop = 0;
  jeRenderVS();
  jeUpdateStatus();
  if (preserveScroll && _savedJeScroll > 0 && wrap) {
    requestAnimationFrame(() => { wrap.scrollTop = _savedJeScroll; });
  }
}

function jeScrollToKey(key) {
  const idx = _jeVsKeyIndex.get(String(key));
  if (idx === undefined) return;
  const wrap = document.getElementById('jeTableWrap');
  if (!wrap) return;
  const targetTop = Math.max(0, idx * JE_VS.ROW_H - wrap.clientHeight / 2);
  requestAnimationFrame(() => {
    wrap.scrollTop = targetTop;
    jeRenderVS();
    setTimeout(() => {
      const rowEl = document.getElementById('jer-' + jeSafeId(String(key)));
      if (rowEl) { rowEl.style.transition = 'background 0.5s'; rowEl.style.background = '#fffde7'; setTimeout(() => { rowEl.style.background = ''; }, 1200); }
    }, 80);
  });
}

const jeWrap = document.getElementById('jeTableWrap');
if (jeWrap) {
  jeWrap.addEventListener('scroll', () => {
    if (!JE_VS.ticking) {
      JE_VS.ticking = true;
      requestAnimationFrame(() => { jeRenderVS(); JE_VS.ticking = false; });
    }
  }, { passive: true });
}

function jeForceUpdateRow(key) {
  try {
    const rowEl = document.getElementById('jer-' + jeSafeId(key));
    if (rowEl) {
      const dups = jeFindDuplicates();
      const idx = _jeVsKeyIndex.get(key) ?? 0;
      const html = jeBuildEditorRow(key, idx, dups);
      const tmp = document.createElement('tbody');
      tmp.innerHTML = html;
      const newRow = tmp.firstElementChild;
      if (newRow) { rowEl.replaceWith(newRow); return; }
    }
  } catch(err) {   }
  const wrap = document.getElementById('jeTableWrap');
  const scroll = wrap ? wrap.scrollTop : 0;
  jeRenderVS();
  if (wrap) requestAnimationFrame(() => { wrap.scrollTop = scroll; });
}

function jePatchRowSafe(key) {
  const rowEl = document.getElementById('jer-' + jeSafeId(key));
  const idx = _jeVsKeyIndex.get(key);
  if (!rowEl || idx === undefined) {

    const wrap = document.getElementById('jeTableWrap');
    const scroll = wrap ? wrap.scrollTop : 0;
    jeRenderVS();
    if (wrap) wrap.scrollTop = scroll;
    return;
  }
  const dups = jeFindDuplicates();
  const tmp = document.createElement('tbody');
  tmp.innerHTML = jeBuildEditorRow(key, idx, dups);
  rowEl.replaceWith(tmp.firstElementChild);
}

const jeTbody = document.getElementById('jeTbody');
jeTbody.addEventListener('keydown', function(e) {
  if (e.target.classList.contains('inp-add-syn') && e.key === 'Enter') {
    e.preventDefault(); jeSaveSynInput(e.target);
  } else if (e.target.classList.contains('je-inp-cell') && e.target.dataset.origkey !== undefined && e.key === 'Enter') {
    e.preventDefault(); e.target.blur();
  }
});
jeTbody.addEventListener('focusout', function(e) {
  if (e.target.classList.contains('inp-add-syn')) jeSaveSynInput(e.target);
  else if (e.target.classList.contains('je-inp-cell') && e.target.dataset.origkey !== undefined) jeRenameMainBC(e.target);
});
jeTbody.addEventListener('input', function(e) {
  if (e.target.classList.contains('inp-add-syn')) jeCheckSynDup(e.target);
  else if (e.target.classList.contains('je-inp-cell') && e.target.dataset.namekey) {
    const k = e.target.dataset.namekey;
    if (jeDB[k]) { jeDB[k][0] = e.target.value; jeDBNotifyChange(); }
  }
});
jeTbody.addEventListener('click', function(e) {
  const x = e.target.closest('.syn-x[data-key]');
  if (x) {
    const key = x.dataset.key, si = parseInt(x.dataset.si, 10);

    if (!jeDB[key] || isNaN(si) || si < 1 || si >= jeDB[key].length) return;
    const removedSyn = String(jeDB[key][si]).trim();
    jeDBSaveHistory();
    jeDB[key].splice(si, 1);
    jeDBNotifyChange();
    jeForceUpdateRow(key);
    showToast(`Кросскод «${removedSyn}» удалён из группы «${key}»`, 'ok');
    return;
  }
  const d = e.target.closest('[data-delkey]');
  if (d) {
    const key = d.dataset.delkey;
    if (!jeDB[key]) return;
    jeConfirmDialog('Удалить группу «' + key + '»?', '🗑 Удаление').then(function(ok) {
      if (!ok) return;
      jeDBSaveHistory(); delete jeDB[key];
      jeDBNotifyChange(); jeRenderEditor(true);

      showToast(`Группа «${key}» удалена`, 'ok');
    });
  }
});

function jeCheckSynDup(input) {
  const val = (input.value||'').trim();
  if (!val) { input.style.borderColor = ''; return; }
  const all = jeGetAllBarcodes();
  if (all.has(val)) input.style.borderColor = '#e8a000';
  else input.style.borderColor = '#217346';
}
function jeSaveSynInput(input) {
  const key = input.dataset.key, val = (input.value||'').trim();
  input.style.borderColor = '';
  if (!val || !jeDB[key]) return;
  if (jeDB[key].includes(val)) { showToast(`ШК «${val}» уже есть в группе`, 'warn'); input.style.borderColor = '#d93025'; setTimeout(() => { input.style.borderColor = ''; input.select(); }, 1400); return; }
  const all = jeGetAllBarcodes();
  if (all.has(val)) { showToast(`ШК «${val}» уже существует в другой группе`, 'warn'); input.style.borderColor = '#e8a000'; setTimeout(() => { input.style.borderColor = ''; input.select(); }, 1400); return; }
  jeDBSaveHistory(); jeDB[key].push(val); input.value = '';
  jeDBNotifyChange(); jePatchRow(key);
  showToast(`Кросскод «${val}» добавлен в группу «${key}»`, 'ok');
}
function jeRenameMainBC(input) {
  const oldKey = input.dataset.origkey, newKey = (input.value||'').trim();
  if (!newKey || newKey === oldKey) return;
  if (jeDB[newKey]) { showToast(`ШК «${newKey}» уже существует`, 'warn'); input.value = oldKey; return; }
  if (!jeDB[oldKey]) { input.value = ''; return; }
  jeDBSaveHistory(); jeDB[newKey] = jeDB[oldKey]; delete jeDB[oldKey];
  jeDBNotifyChange(); jeRenderEditor(true);

  showToast(`Штрихкод «${oldKey}» → «${newKey}»`, 'ok');
}

document.getElementById('jeCreateBtn').addEventListener('click', function() {
  const name = document.getElementById('jeNName').value.trim();
  const mainBC = document.getElementById('jeNMainBC').value.trim();
  const synsRaw = document.getElementById('jeNSyns').value.split(',').map(s=>s.trim()).filter(Boolean);

  if (!mainBC) { showToast('Введите главный штрихкод', 'warn'); document.getElementById('jeNMainBC').focus(); return; }

  const all = jeGetAllBarcodes();

  if (all.has(mainBC)) {
    showToast(`ШК «${mainBC}» уже существует в базе как ${jeDB[mainBC] ? 'главный' : 'кросскод'}`, 'warn');
    document.getElementById('jeNMainBC').focus(); return;
  }

  const dupSyn = synsRaw.find(s => all.has(s));
  const doCreate = () => {
    jeDBSaveHistory();
    jeDB[mainBC] = [name || mainBC, ...synsRaw];
    jeDBNotifyChange();
    jeRenderEditor(true);

    jeClearForm();

    switchMainPane('jsoneditor');
    setTimeout(() => jeScrollToKey(mainBC), 60);

    showToast(`Группа «${mainBC}» создана`, 'ok');
  };

  if (dupSyn) {
    jeConfirmDialog(`Кросскод «${dupSyn}» уже есть в базе. Всё равно добавить?`, '⚠️ Дубль').then(ok => {
      if (!ok) return;
      doCreate();
    });
    return;
  }
  doCreate();
});
document.getElementById('jeClearFormBtn').addEventListener('click', jeClearForm);
function jeClearForm() {
  ['jeNName','jeNMainBC','jeNSyns'].forEach(id => document.getElementById(id).value = '');
}

document.querySelectorAll('.syn-subtab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.syn-subtab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.syn-subtab-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const pane = document.getElementById('subpane-' + tab.dataset.subtab);
    if (pane) pane.classList.add('active');
  });
});

document.getElementById('jeUndoBtn').addEventListener('click', jeUndo);
document.getElementById('jeRedoBtn').addEventListener('click', jeRedo);
document.getElementById('jeSearchInp').addEventListener('input', jeRenderEditor);

document.getElementById('jeClearBtn').addEventListener('click', function() {
  jeConfirmDialog('Очистить всю базу штрихкодов?', '🗑 Очистка').then(ok => {
    if (!ok) return;
    const prevCount = Object.keys(jeDB).length;
    jeDBSaveHistory(); jeDB = {}; _jeDupsCache = null; jeChanges = 0;
    document.getElementById('jeSearchInp').value = '';
    jeUpdateStatus(); jeRenderEditor(); rebuildBarcodeAliasFromJeDB();
    unifiedMarkUnsaved();
    showToast(`База очищена — удалено ${prevCount} групп`, 'ok');
  });
});

document.getElementById('jeExportXlsxBtn').addEventListener('click', async function() {
  const rows = [['Штрихкод','Наименование','Кросскоды ШК']];
  for (const [k,v] of Object.entries(jeDB)) rows.push([k, Array.isArray(v)?(v[0]||''):'', Array.isArray(v)?v.slice(1).join(', '):'']);
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{wch:20},{wch:44},{wch:60}];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Кросскоды');
  const buf = XLSX.write(wb, {bookType:'xlsx',type:'array'});
  const _sxBlob = new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const _sxFname = `synonyms_${new Date().toISOString().slice(0,10)}.xlsx`;
  await saveBlobWithDialogOrDownload(_sxBlob, _sxFname);
});

let _jeXlsResolve = null;
function jeXlsModalClose(mode) {
  document.getElementById('jeXlsModal').style.display = 'none';
  if (_jeXlsResolve) { _jeXlsResolve(mode); _jeXlsResolve = null; }
}
document.getElementById('jeImportXlsxBtn').addEventListener('click', () => document.getElementById('jeXlsxFileIn').click());
document.getElementById('jeXlsxFileIn').addEventListener('change', async function(e) {
  const file = e.target.files[0]; if (!file) return; e.target.value = '';
  try {
    const data = await new Promise((res,rej) => {
      const r = new FileReader(); r.onload = ev => {
        try { const wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array'}); res(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])); } catch(err){rej(err);}
      }; r.readAsArrayBuffer(file);
    });
    const bcCols=['штрихкод','штрих-код','barcode','шк','ean','код'];
    const nmCols=['название','наименование','name','товар','продукт','наим'];
    const snCols=['кросскоды','синонимы','synonyms','синоним','synonym'];
    const cols = data.length ? Object.keys(data[0]) : [];
    const bcCol = cols.find(c=>bcCols.some(v=>c.toLowerCase().includes(v)))||cols[0];
    const nmCol = cols.find(c=>nmCols.some(v=>c.toLowerCase().includes(v)))||cols[1];
    const snCol = cols.find(c=>snCols.some(v=>c.toLowerCase().includes(v)))||null;
    if (!bcCol) { showToast('Не найдена колонка штрихкода', 'warn'); return; }
    const validRows = data.filter(r=>String(r[bcCol]||'').trim());
    const conflictCnt = validRows.filter(r=>jeDB[String(r[bcCol]).trim()]).length;
    let mode = 'overwrite';
    if (conflictCnt > 0) {
      document.getElementById('jeXlsModalMsg').textContent = `${conflictCnt} из ${validRows.length} записей уже есть в базе. Как поступить?`;
      document.getElementById('jeXlsModal').style.display = 'flex';
      mode = await new Promise(res => { _jeXlsResolve = res; });
      if (!mode) return;
    }
    jeDBSaveHistory();
    let added = 0, skipped = 0;
    for (const row of validRows) {
      const bc = String(row[bcCol]).trim();
      const name = nmCol ? String(row[nmCol]||'').trim() : bc;
      const syns = snCol ? String(row[snCol]||'').split(',').map(s=>s.trim()).filter(Boolean) : [];
      if (jeDB[bc] && mode==='skip') { skipped++; continue; }
      if (jeDB[bc] && mode==='merge') {
        const ex=jeDB[bc];const exSet=new Set(ex.slice(1).map(s=>String(s).trim()));
        syns.forEach(s=>{if(s&&!exSet.has(s))ex.push(s);});
        if(name&&!ex[0])ex[0]=name; added++; continue;
      }
      jeDB[bc]=[name,...syns]; added++;
    }
    jeDBNotifyChange(); jeRenderEditor();
    unifiedMarkUnsaved();
    showToast(mode==='skip'?`Добавлено: ${added}, пропущено: ${skipped}`:`Обработано: ${added}`, 'ok');
  } catch(err) { showToast('Ошибка импорта: '+err.message, 'warn'); }
});

function rebuildBarcodeAliasFromJeDB(_skip) {
  if (typeof barcodeAliasMap === 'undefined') return;
  const m = new Map();
  for (const [key, val] of Object.entries(jeDB)) {
    m.set(key, key);
    if (Array.isArray(val)) val.slice(1).forEach(s => { s = String(s).trim(); if (s) m.set(s, key); });
  }
  barcodeAliasMap.clear();
  m.forEach((v, k) => barcodeAliasMap.set(k, v));
  synonymsLoaded = m.size > 0;
  const st = document.getElementById('synonymsStatus');
  if (st && m.size > 0) {
    st.className = 'upload-status upload-status--ok';
    st.textContent = '✅ Групп: ' + Object.keys(jeDB).length;
    st.style.display = 'none';

  } else if (st && m.size === 0) {
    st.style.display = '';
  }

  if (typeof _slotShowJsonChip === 'function' && m.size > 0) {
    const sfName = document.getElementById('sfJsonName');
    const fn = (sfName && sfName.textContent && sfName.textContent !== 'JSON не загружен') ? sfName.textContent : 'База кросскодов';
    _slotShowJsonChip(fn, Object.keys(jeDB).length);
  } else if (typeof _slotClearJsonChip === 'function' && m.size === 0) {
    _slotClearJsonChip();
  }

  const bcBadge = document.getElementById('bcCountBadge');
  if (bcBadge) bcBadge.textContent = Object.keys(jeDB).length;
  if (!_skip && typeof allFilesData !== 'undefined' && allFilesData.length > 0) {
    clearTimeout(rebuildBarcodeAliasFromJeDB._t);
    rebuildBarcodeAliasFromJeDB._t = setTimeout(function() { processData(); renderTable(true); updateUI(); }, 80);
  }
}

// ── Централизованная загрузка JSON-состояния ──────────────────────────────
// Вызывается при загрузке нового файла-памяти. Полностью заменяет ВСЕ
// параметры приложения данными из JSON — независимо от того, присутствует
// ли тот или иной ключ (отсутствие ключа = сброс к значению по умолчанию).
function applyJsonToState(json, fileName) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return;

  // ── 1. Штрихкоды (barcodes / кросскоды) ─────────────────────────────────
  const hasBarcodes = 'barcodes' in json;
  const barcodes = hasBarcodes ? json.barcodes : json;
  jeDB = JSON.parse(JSON.stringify(barcodes || {}));
  _jeDupsCache = null;
  jeChanges = 0;
  if (typeof jeUndoStack !== 'undefined') jeUndoStack = [];
  if (typeof jeRedoStack !== 'undefined') jeRedoStack = [];
  if (typeof jeUpdateUndoUI === 'function') jeUpdateUndoUI();

  // ── 2. База брендов ──────────────────────────────────────────────────────
  // Всегда перезаписываем: если brands отсутствует в JSON — очищаем базу
  _brandDB = json.brands ? JSON.parse(JSON.stringify(json.brands)) : {};
  if (typeof brandRender === 'function') brandRender();

  if (Object.keys(_brandDB).length > 0) {
    const conflicted = Object.entries(_brandDB).filter(([k, v]) => {
      const c = brandCheckConflicts(k, v.synonyms || [], v.antonyms || [], k);
      return c.conflicts.length > 0;
    });
    if (conflicted.length > 0) {
      showToast(`⚠️ ${conflicted.length} бренд(ов) с конфликтами — откройте «База кросскодов → Бренды» для исправления`, 'warn');
    }
  }

  // ── 3. Слова категорий ───────────────────────────────────────────────────
  // Всегда сбрасываем, затем загружаем из JSON (или оставляем пустым)
  _catWordsBase = new Set();
  _catWordsExpanded = new Set();
  const _loadBase = json.categoryWords || json.categoryExclusionsBase;
  if (_loadBase && Array.isArray(_loadBase)) {
    _catWordsBase = new Set(_loadBase.map(s => String(s).toLowerCase().trim()).filter(Boolean));
  }
  if (typeof _catWordsExpandFromBase === 'function') _catWordsExpandFromBase();
  if (typeof _catExclUpdateBadge === 'function') _catExclUpdateBadge();

  // ── 4. Настройки колонок ─────────────────────────────────────────────────
  // Всегда перезаписываем: если columnSettings отсутствует — сбрасываем к дефолту
  if (json.columnSettings && json.columnSettings.templates && json.columnSettings.templates.length) {
    columnTemplates = json.columnSettings.templates.slice();
    columnSynonyms  = json.columnSettings.synonyms
      ? JSON.parse(JSON.stringify(json.columnSettings.synonyms))
      : JSON.parse(JSON.stringify(DEFAULT_COLUMN_SYNONYMS));
    _columnSettingsFromFile = true;
  } else {
    // Нет настроек в новом JSON — сброс к дефолтным
    columnTemplates = DEFAULT_COLUMN_TEMPLATES.slice();
    columnSynonyms  = JSON.parse(JSON.stringify(DEFAULT_COLUMN_SYNONYMS));
    _columnSettingsFromFile = false;
  }
  persistAll(false);
  if (typeof _updateColSettingsBadge === 'function') _updateColSettingsBadge();
  if (typeof renderTemplatesList === 'function') renderTemplatesList();

  // ── 5. Сигнал для других компонентов (matcher и пр.) ────────────────────
  AppBridge.emit('settingsLoaded', json);

  // ── 6. Обновление UI ─────────────────────────────────────────────────────
  rebuildBarcodeAliasFromJeDB();
  if (typeof jeUpdateStatus === 'function') jeUpdateStatus();
  if (typeof jeRenderEditor === 'function') jeRenderEditor();

  if (typeof _slotShowJsonChip === 'function') {
    const _jfn = (fileName || 'JSON').replace(/\.json$/i, '');
    _slotShowJsonChip(_jfn, Object.keys(jeDB).length);
  }

  unifiedMarkUnsaved(false);
  try { localStorage.removeItem('_pm_brandDB_session'); } catch(e) {}

  if (typeof allFilesData !== 'undefined' && allFilesData.length > 0) {
    processData(); renderTable(); updateUI();
  }

  // ── 7. Итоговый тост ─────────────────────────────────────────────────────
  const bcCount = Object.keys(jeDB).length;
  const brCount = Object.keys(_brandDB).length;
  const hasColSettings = !!json.columnSettings;
  const hasCatWords = _catWordsBase.size > 0;
  let parts = [];
  if (bcCount) parts.push(`${bcCount} ШК-групп`);
  if (brCount) parts.push(`${brCount} брендов`);
  if (hasColSettings) parts.push('настройки колонок');
  if (hasCatWords) parts.push(`${_catWordsBase.size} слов категорий`);
  showToast(`✅ Загружено: ${parts.join(', ') || 'пустой файл'}`, 'ok');
}
window.applyJsonToState = applyJsonToState;

document.getElementById('synonymsInput').addEventListener('change', function(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const json = JSON.parse(ev.target.result);
      applyJsonToState(json, file.name);
    } catch(err) { showToast('Ошибка JSON: ' + err.message, 'warn'); }
  };
  reader.readAsText(file, 'utf-8');
}, true);

document.addEventListener('keydown', function(e) {
  const inInput = e.target.matches('input,textarea,select');
  if ((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !inInput) {
    e.preventDefault(); jeUndo();
  }
  if ((e.ctrlKey||e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !inInput) {
    e.preventDefault(); jeRedo();
  }
  if (e.key === 'Escape') {
    closeMatchModal();
    jeConfirmClose(false);
    jeXlsModalClose(null);
    brandCloseEdit();
  }
});


// ── Category Words (inclusion whitelist for dropdown) ───────

// Rebuild _catWordsExpanded from _catWordsBase + current brandDB synonyms.
function _catWordsExpandFromBase() {
  _catWordsExpanded = new Set(_catWordsBase);
  if (typeof _brandDB === 'undefined' || !_brandDB) return;
  _catWordsBase.forEach(function(w) {
    Object.entries(_brandDB).forEach(function([key, val]) {
      const canon = key.toLowerCase();
      const syns = (val.synonyms || []).map(function(s){ return s.toLowerCase(); });
      if (canon === w || syns.indexOf(w) !== -1) {
        _catWordsExpanded.add(canon);
        syns.forEach(function(s){ if (s) _catWordsExpanded.add(s); });
      }
    });
  });
}

// Debounced sync — called when brandDB changes.
let _catExclSyncTimer = null;
function _catExclSyncWithBrandDB() {
  if (!_catWordsBase.size) return;
  clearTimeout(_catExclSyncTimer);
  _catExclSyncTimer = setTimeout(function() {
    _catWordsExpandFromBase();
    unifiedMarkUnsaved(true);
    _catExclUpdateBadge();
    if (typeof buildCategoryDropdown === 'function') buildCategoryDropdown();
  }, 400);
}

// Check contradictions: returns list of brand entries where this word is an antonym
function _catWordsCheckConflict(w) {
  const conflicts = [];
  if (typeof _brandDB === 'undefined' || !_brandDB) return conflicts;
  Object.entries(_brandDB).forEach(function([key, val]) {
    const ants = (val.antonyms || []).map(function(s){ return s.toLowerCase(); });
    const canon = key.toLowerCase();
    const syns = (val.synonyms || []).map(function(s){ return s.toLowerCase(); });
    if (ants.indexOf(w) !== -1) {
      conflicts.push({ brand: canon, syns: syns, ants: ants });
    }
    // also check if this word's synonyms are antonyms
    if (syns.indexOf(w) !== -1 || canon === w) {
      const synsInAnts = (val.antonyms || []).filter(function(a){ return _catWordsBase.has(a.toLowerCase()); });
      if (synsInAnts.length) {
        conflicts.push({ brand: canon, syns: syns, ants: ants, note: 'В антонимах уже выбранное слово: ' + synsInAnts.join(', ') });
      }
    }
  });
  return conflicts;
}

function _catExclUpdateBadge() {
  const badge = document.getElementById('catExclBadge');
  if (badge) badge.textContent = _catWordsBase.size > 0 ? '(' + _catWordsBase.size + ') ' : '';
  const clearBtn = document.getElementById('catExclClearBtn');
  if (clearBtn) clearBtn.style.display = _catWordsBase.size > 0 ? '' : 'none';
  const countEl = document.getElementById('catExclSelectedCount');
  if (countEl) countEl.textContent = _catWordsBase.size > 0 ? _catWordsBase.size : '';
  const cur = document.getElementById('catExclCurrentList');
  if (!cur) return;
  if (!_catWordsBase.size) {
    cur.innerHTML = '<div class="cem-empty-hint">Не выбрано — в фильтре будут все частые слова</div>';
    return;
  }
  cur.innerHTML = [..._catWordsBase].sort().map(function(w) {
    const allForRoot = [];
    if (typeof _brandDB !== 'undefined' && _brandDB) {
      Object.entries(_brandDB).forEach(function([key, val]) {
        const canon = key.toLowerCase();
        const syns = (val.synonyms || []).map(function(s){ return s.toLowerCase(); });
        if (canon === w || syns.indexOf(w) !== -1) {
          syns.forEach(function(s){ if (s && s !== w) allForRoot.push(s); });
          if (canon !== w) allForRoot.push(canon);
        }
      });
    }
    const tipText = allForRoot.length ? 'Синонимы: ' + allForRoot.join(', ') : '';
    const safeW = w.replace(/'/g, "\\'");
    return '<span class="cem-chip"' + (tipText ? ' title="' + tipText + '"' : '') + '>'
      + '<span>' + w + '</span>'
      + (allForRoot.length ? '<span class="cem-chip-syns">+' + allForRoot.length + '</span>' : '')
      + '<button class="cem-chip-x" onclick="_catExclRemove(\'' + safeW + '\')" title="Убрать из категорий">✕</button>'
      + '</span>';
  }).join('');
}

function _catExclRemove(w) {
  _catWordsBase.delete(w);
  _catWordsExpandFromBase();
  unifiedMarkUnsaved(true);
  if (typeof window._pmScheduleSave === 'function') window._pmScheduleSave();
  _catExclUpdateBadge();
  _catExclRenderWordList();
  if (typeof buildCategoryDropdown === 'function') buildCategoryDropdown();
}

function _catExclAdd(w) {
  const wl = w.toLowerCase();
  // Contradiction check
  const conflicts = _catWordsCheckConflict(wl);
  if (conflicts.length) {
    const msg = conflicts.map(function(c){ return c.note || ('«' + c.brand + '» — это слово в антонимах'); }).join('; ');
    if (typeof showToast === 'function') showToast('⚠️ Противоречие: ' + msg, 'warn');
    // Still allow adding, just warn
  }
  _catWordsBase.add(wl);
  _catWordsExpandFromBase();
  unifiedMarkUnsaved(true);
  if (typeof window._pmScheduleSave === 'function') window._pmScheduleSave();
  _catExclUpdateBadge();
  _catExclRenderWordList();
  if (typeof buildCategoryDropdown === 'function') buildCategoryDropdown();
}

function _catExclRenderWordList(filterText) {
  const container = document.getElementById('catExclWordList');
  if (!container) return;
  const synToCanon = new Map();
  if (typeof _brandDB !== 'undefined' && _brandDB) {
    Object.entries(_brandDB).forEach(function([key, val]) {
      const canon = key.toLowerCase();
      synToCanon.set(canon, canon);
      (val.synonyms || []).forEach(function(s){ if (s) synToCanon.set(s.toLowerCase(), canon); });
    });
  }
  const freq = {};
  const rePunct = /[«»""''()\[\]{}\\/|.,;:!?@#$%^&*+=<>~`№—–\-]/g;
  if (typeof groupedData !== 'undefined' && groupedData) {
    groupedData.forEach(function(item) {
      const seen = new Set();
      item.names.forEach(function(n) {
        if (!n.name) return;
        n.name.replace(rePunct, ' ').split(/\s+/).forEach(function(w) {
          const wl = w.toLowerCase().trim();
          if (wl.length < 3 || /^\d/.test(wl) || /^\d+([.,]\d+)?$/.test(wl)) return;
          const canon = synToCanon.get(wl) || wl;
          if (!seen.has(canon)) { seen.add(canon); freq[canon] = (freq[canon] || 0) + 1; }
        });
      });
    });
  }
  const top120 = Object.entries(freq).sort(function(a,b){ return b[1]-a[1]; }).slice(0,120).map(function([w]){ return w; });
  // Store for filter
  _catExclAllWords = top120;
  _catExclApplyWordFilter(filterText || (document.getElementById('catExclSearchInp') ? document.getElementById('catExclSearchInp').value : ''));
}

let _catExclAllWords = [];

function _catExclApplyWordFilter(q) {
  const container = document.getElementById('catExclWordList');
  if (!container) return;
  const words = q ? _catExclAllWords.filter(function(w){ return w.includes(q.toLowerCase().trim()); }) : _catExclAllWords;
  const countEl = document.getElementById('catExclWordsCount');
  if (countEl) countEl.textContent = words.length + ' слов';
  container.innerHTML = words.map(function(w) {
    const isSelected = _catWordsBase.has(w);
    const isExpanded = !isSelected && _catWordsExpanded.has(w);
    const hasConflict = _catWordsCheckConflict(w).length > 0;
    const safeW = w.replace(/'/g, "\\'");
    let style, label;
    if (isSelected) {
      style = 'background:var(--accent-bg);border:1.5px solid var(--accent);color:var(--accent-dark);font-weight:700;';
      label = '✓ ' + w;
    } else if (isExpanded) {
      style = 'background:#F0F9FF;border:1px solid #93C5FD;color:#1E3A5F;';
      label = '≈ ' + w;
    } else if (hasConflict) {
      style = 'background:var(--amber-bg);border:1px solid #FDE68A;color:#92400E;';
      label = '⚠ ' + w;
    } else {
      style = 'background:var(--surface);border:1px solid var(--border-strong);color:var(--text-secondary);';
      label = w;
    }
    const tip = isSelected ? 'Выбрано — нажмите чтобы убрать' : isExpanded ? 'Синоним выбранного слова' : hasConflict ? 'Противоречие с антонимами — добавить всё равно?' : 'Добавить в фильтр категорий';
    return '<button onclick="_catExclToggle(\'' + safeW + '\')"'
      + ' style="padding:5px 12px;border-radius:99px;font-size:var(--fz-sm);font-weight:500;cursor:pointer;transition:background 100ms,border-color 100ms,color 100ms;font-family:\'Inter\',sans-serif;' + style + '"'
      + ' title="' + tip + '">'
      + label
      + '</button>';
  }).join('');
}

function _catExclFilterWords(q) {
  _catExclApplyWordFilter(q);
}

function _catExclToggle(w) {
  if (_catWordsBase.has(w)) { _catExclRemove(w); }
  else { _catExclAdd(w); }
}

(function() {
  var btn = document.getElementById('catExclBtn');
  if (btn) btn.addEventListener('click', function() {
    var modal = document.getElementById('catExclModal');
    if (modal) {
      modal.style.display = 'flex';
      _catExclUpdateBadge();
      _catExclRenderWordList();
    }
  });
  var clearBtn = document.getElementById('catExclClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', function() {
    _catWordsBase.clear();
    _catWordsExpanded.clear();
    unifiedMarkUnsaved(true);
    if (typeof window._pmScheduleSave === 'function') window._pmScheduleSave();
    _catExclUpdateBadge();
    _catExclRenderWordList();
    if (typeof buildCategoryDropdown === 'function') buildCategoryDropdown();
  });
  var modal = document.getElementById('catExclModal');
  if (modal) modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.style.display = 'none';
  });
})();
// ─────────────────────────────────────────────────────────────
jeUpdateStatus();
jeRenderEditor();

let _unifiedUnsaved = false;

function unifiedMarkUnsaved(dirty = true) {
  _unifiedUnsaved = dirty;
  const badge = document.getElementById('unifiedUnsaved');
  if (badge) {
    badge.style.display = dirty ? 'flex' : 'none';
    if (dirty) badge.style.flexDirection = 'column';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const headerArchiveBtn = document.getElementById('obrHeaderArchiveBtn');
  if (!headerArchiveBtn) return;
  headerArchiveBtn.addEventListener('click', async function() {
    if (!_obrArchiveFiles.length) { showToast('Нет обработанных файлов для архива', 'warn'); return; }
    headerArchiveBtn.disabled = true;
    try {
      const zip = new JSZip();

      _obrArchiveFiles.forEach(function(f) { zip.file(f.fileName, f.csvText); });

      try {
        if ((typeof jeDB !== 'undefined' && Object.keys(jeDB).length > 0) || (typeof _brandDB !== 'undefined' && Object.keys(_brandDB).length > 0)) {
          const combined = {
            barcodes: (typeof jeDB !== 'undefined') ? jeDB : {},
            brands: (typeof _brandDB !== 'undefined') ? _brandDB : {},
            categoryWords: (typeof _catWordsBase !== 'undefined' && _catWordsBase.size > 0) ? [..._catWordsBase].sort() : undefined,
            columnSettings: (typeof columnTemplates !== 'undefined' && typeof columnSynonyms !== 'undefined') ? { templates: columnTemplates, synonyms: columnSynonyms } : undefined
          };
          const now0 = new Date();
          const s0 = now0.getFullYear() + '_' + String(now0.getMonth()+1).padStart(2,'0') + '_' + String(now0.getDate()).padStart(2,'0');
          zip.file('settings_' + s0 + '.json', JSON.stringify(combined, null, 2));
        }
      } catch(je) {}

      if (typeof window._generateExcel === 'function') {
        try {

          const origSave = window.saveBlobWithDialogOrDownload;
          const xlsxFiles = [];
          window.saveBlobWithDialogOrDownload = async function(blob, name) { xlsxFiles.push({blob, name}); };
          try {
            await window._generateExcel('myprice').catch(() => {});
            await window._generateExcel('all').catch(() => {});
          } finally {
            window.saveBlobWithDialogOrDownload = origSave;
          }
          for (const xf of xlsxFiles) {
            const ab = await xf.blob.arrayBuffer();
            zip.file(xf.name, ab);
          }
        } catch(xe) {}
      }
      // add cart if has items
      if (typeof window._cartHasItems === 'function' && window._cartHasItems() && typeof window._cartGetExcelBlob === 'function') {
        try {
          const cartBlob = await window._cartGetExcelBlob();
          if (cartBlob) {
            const now0 = new Date();
            const s0 = now0.getFullYear() + '_' + String(now0.getMonth()+1).padStart(2,'0') + '_' + String(now0.getDate()).padStart(2,'0');
            zip.file('cart_' + s0 + '.xlsx', await cartBlob.arrayBuffer());
          }
        } catch(ce) {}
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const now = new Date();
      const stamp = now.getFullYear() + '_' + String(now.getMonth()+1).padStart(2,'0') + '_' + String(now.getDate()).padStart(2,'0');
      saveAs(blob, 'price_export_' + stamp + '.zip');
      showToast('✅ Архив скачан: CSV + Excel + JSON', 'ok');
    } catch(err) {
      showToast('Ошибка архива: ' + (err.message || err), 'err');
    } finally {
      headerArchiveBtn.disabled = false;
    }
  });
});

document.getElementById('unifiedSaveJsonBtn').addEventListener('click', async function() {
  const combined = {
    barcodes: jeDB,
    brands: _brandDB,
    categoryWords: _catWordsBase.size > 0 ? [..._catWordsBase].sort() : undefined,
    columnSettings: (typeof columnTemplates !== 'undefined' && typeof columnSynonyms !== 'undefined') ? {
      templates: columnTemplates,
      synonyms: columnSynonyms
    } : undefined
  };
  const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' });
  const _sjFname = `settings_${new Date().toISOString().slice(0,10)}.json`;
  await saveBlobWithDialogOrDownload(blob, _sjFname);
  unifiedMarkUnsaved(false);
  // Clear localStorage session since JSON has been saved
  try { localStorage.removeItem("_pm_brandDB_session"); } catch(e) {}
  showToast(`JSON сохранён: ${Object.keys(jeDB).length} ШК + ${Object.keys(_brandDB).length} брендов + настройки колонок`, 'ok');
});

let _catWordsExpanded = new Set(); // all words for category dropdown (base + auto-synonyms)
let _catWordsBase = new Set(); // root words user explicitly selected for categories
let _brandDB = (() => {
  if (typeof BRAND_CONFIG_SAVED === 'undefined') return {};

  const s = BRAND_CONFIG_SAVED;
  return (s && typeof s === 'object' && !Array.isArray(s) && ('barcodes' in s || 'brands' in s))
    ? JSON.parse(JSON.stringify(s.brands || {}))
    : JSON.parse(JSON.stringify(s));
})();

// Restore _brandDB from localStorage session if it has more data than BRAND_CONFIG_SAVED
try {
  const _lsSession = JSON.parse(localStorage.getItem('_pm_brandDB_session') || 'null');
  if (_lsSession && _lsSession.brands && typeof _lsSession.brands === 'object') {
    const lsKeys = Object.keys(_lsSession.brands).length;
    const savedKeys = Object.keys(_brandDB).length;
    // Only restore from localStorage if it has data (and no JSON was pre-loaded)
    if (lsKeys > 0 && savedKeys === 0) {
      _brandDB = JSON.parse(JSON.stringify(_lsSession.brands));
    } else if (lsKeys > savedKeys) {
      // Merge: localStorage has more brands, use it as base and overlay saved config
      _brandDB = Object.assign(JSON.parse(JSON.stringify(_lsSession.brands)), _brandDB);
    }
  }
} catch(e) {}


if (typeof BRAND_CONFIG_SAVED !== 'undefined' && BRAND_CONFIG_SAVED) {
  const _savedCfg = BRAND_CONFIG_SAVED;
  // Load category words (prefer categoryWords, fallback to categoryExclusionsBase for old JSON)
  const _loadBaseArr = _savedCfg.categoryWords || _savedCfg.categoryExclusionsBase;
  if (_loadBaseArr && Array.isArray(_loadBaseArr)) {
    _catWordsBase = new Set(_loadBaseArr.map(s => String(s).toLowerCase().trim()).filter(Boolean));
    _catWordsExpandFromBase();
  }
}
if (typeof BRAND_CONFIG_SAVED !== 'undefined' && BRAND_CONFIG_SAVED && BRAND_CONFIG_SAVED.barcodes) {
  jeDB = JSON.parse(JSON.stringify(BRAND_CONFIG_SAVED.barcodes));
  _jeDupsCache = null;
  jeUpdateStatus();
  jeRenderEditor();
  rebuildBarcodeAliasFromJeDB();
}

function brandParseCsv(raw) {
  return (raw || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
function brandNormKey(s) {
  return String(s || '').trim().toLowerCase();
}

function brandMarkUnsaved() {
  unifiedMarkUnsaved(true);
  const badge = document.getElementById('brandCountBadge');
  if (badge) badge.textContent = Object.keys(_brandDB).length;
  // auto-sync category words when brand synonyms change
  if (typeof _catExclSyncWithBrandDB === 'function') _catExclSyncWithBrandDB();
  // auto-save to localStorage for session persistence
  try {
    localStorage.setItem('_pm_brandDB_session', JSON.stringify({ brands: _brandDB, ts: Date.now() }));
  } catch(e) {}
}

let _brandFilterConflicts = false;
let _brandEmptyOverridden = false;

function brandRender() {
  const q = (document.getElementById('brandSearchInp').value || '').toLowerCase().trim();
  const keys = Object.keys(_brandDB).sort((a, b) => a.localeCompare(b, 'ru'));

  const conflictMap = new Map();

  for (const k of keys) {
    const v = _brandDB[k];
    const check = brandCheckConflicts(k, v.synonyms || [], v.antonyms || [], k);
    conflictMap.set(k, { hasConflict: check.conflicts.length > 0, conflictWords: check.conflictWords, conflicts: check.conflicts });
  }

  const totalConflicts = [...conflictMap.values()].filter(c => c.hasConflict).length;

  const cfBtn = document.getElementById('brandConflictFilterBtn');
  if (cfBtn) {
    cfBtn.textContent = `⚠️ Конфликты${totalConflicts ? ' (' + totalConflicts + ')' : ''}`;
    cfBtn.classList.toggle('active-warn', _brandFilterConflicts);
    cfBtn.classList.toggle('btn-secondary', !_brandFilterConflicts);
  }

  let filtered = _brandFilterConflicts
    ? keys.filter(k => conflictMap.get(k).hasConflict)
    : keys;

  if (q) {
    filtered = filtered.filter(k => {
      const v = _brandDB[k];
      if (k.includes(q)) return true;
      if ((v.synonyms || []).some(s => s.includes(q))) return true;
      if ((v.antonyms || []).some(s => s.includes(q))) return true;
      return false;
    });
  }

  const list   = document.getElementById('brandList');
  const empty  = document.getElementById('brandEmpty');
  const badge  = document.getElementById('brandCountBadge');
  const tableWrap = document.getElementById('brandTableWrap');
  const searchArea = document.getElementById('brandSearchArea');
  if (badge) badge.textContent = keys.length;
  if (searchArea) searchArea.style.display = keys.length > 0 ? '' : 'none';

  if (!filtered.length) {
    list.innerHTML = '';
    if (tableWrap) tableWrap.style.display = 'none';
    empty.style.display = '';
    if (_brandFilterConflicts && !q) {
      empty.innerHTML = `<div style="font-size:28px;margin-bottom:8px;">✅</div><div>Конфликтов не обнаружено</div>`;
      _brandEmptyOverridden = true;
    } else if (q) {
      empty.innerHTML = `<div style="font-size:28px;margin-bottom:8px;">🔍</div><div>По запросу «${q}» ничего не найдено</div>`;
      _brandEmptyOverridden = true;
    } else if (_brandEmptyOverridden) {

      const instrEl = document.getElementById('brandEmpty');
      if (instrEl) {
        const saved = instrEl.getAttribute('data-instr-html');
        if (saved) instrEl.innerHTML = saved;
      }
      _brandEmptyOverridden = false;
    }

    return;
  }
  empty.style.display = 'none';
  if (tableWrap) tableWrap.style.display = '';

  function highlightWords(text, conflictWordSet) {
    if (!conflictWordSet || !conflictWordSet.size) return esc(text);
    return text.split(',').map(part => {
      const trimmed = part.trim();
      const isConflict = conflictWordSet.has(trimmed.toLowerCase());
      const escaped = esc(trimmed);
      return isConflict
        ? `<span style="background:#fff3cd;border:1px solid #ffc107;border-radius:3px;padding:0 3px;font-weight:700;color:var(--amber-dark);" title="Конфликтное слово">${escaped}</span>`
        : escaped;
    }).join(', ');
  }

  list.innerHTML = filtered.map((k, idx) => {
    const v = _brandDB[k];
    const ci = conflictMap.get(k);
    const cw = ci.conflictWords;
    const synsStr = (v.synonyms || []).join(', ') || '';
    const antiStr = (v.antonyms || []).join(', ') || '';
    const synsHtml = synsStr ? highlightWords(synsStr, cw) : `<span style="color:var(--text-muted)">—</span>`;
    const antiHtml = antiStr ? highlightWords(antiStr, cw) : `<span style="color:var(--text-muted)">—</span>`;
    const conflictTip = ci.hasConflict
      ? `<span class="brand-conflict-badge" onclick="brandOpenEdit(decodeURIComponent('${encodeURIComponent(k)}'))" title="${ci.conflicts.join('; ')}">⚠️ Конфликт</span>`
      : '';
    return `<tr class="${ci.hasConflict ? 'brand-row--conflict' : ''}" data-key="${encodeURIComponent(k)}">
      <td style="text-align:center;color:var(--text-muted);font-size:10px;">${idx+1}</td>
      <td><div class="brand-canonical">${esc(k)}</div>${conflictTip}</td>
      <td><div class="brand-syns">${synsHtml}</div></td>
      <td><div class="brand-antonyms">${antiHtml}</div></td>
      <td>
        <div class="brand-actions-cell">
          <button class="brand-edit-btn" onclick="brandOpenEdit(decodeURIComponent('${encodeURIComponent(k)}'))" title="Редактировать">✏️</button>
          <button class="brand-del-btn" onclick="brandDelete(decodeURIComponent('${encodeURIComponent(k)}'))" title="Удалить">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function brandDelete(key) {
  if (!_brandDB[key]) return;
  jeConfirmDialog('Удалить бренд «' + key + '»?', '🗑 Удаление').then(function(ok) {
    if (!ok) return;
    delete _brandDB[key];
    brandRender(); brandMarkUnsaved();
    showToast('Бренд «' + key + '» удалён', 'ok');
  });
}

function brandOpenEdit(key) {
  const v = _brandDB[key] || {};
  document.getElementById('beEditKey').value = key;
  document.getElementById('beCanon').value = key;
  document.getElementById('beSyns').value = (v.synonyms || []).join(', ');
  document.getElementById('beAnti').value = (v.antonyms || []).join(', ');
  document.getElementById('brandEditModal').classList.add('open');
}
function brandCloseEdit() {
  document.getElementById('brandEditModal').classList.remove('open');
}
function brandSaveEdit() {
  const oldKey = document.getElementById('beEditKey').value;
  const newKey = brandNormKey(document.getElementById('beCanon').value);
  if (!newKey) { showToast('Укажите канонический бренд', 'warn'); return; }
  const syns = brandParseCsv(document.getElementById('beSyns').value);
  const anti = brandParseCsv(document.getElementById('beAnti').value);

  const check = brandCheckConflicts(newKey, syns, anti, oldKey);

  const doSave = () => {
    if (oldKey && oldKey !== newKey) delete _brandDB[oldKey];
    _brandDB[newKey] = { synonyms: syns, antonyms: anti };
    brandCloseEdit(); brandRender(); brandMarkUnsaved();
    if (check.conflicts.length) {
      showToast(`⚠️ Бренд «${newKey}» сохранён с конфликтами (${check.conflicts.length})`, 'warn');
    } else {
      showToast(`Бренд «${newKey}» сохранён`, 'ok');
    }
  };

  if (check.conflicts.length) {
    const msg = brandConflictHtml(check) + `<div style="margin-top:10px;font-size:13px;">Всё равно сохранить?</div>`;
    jeConfirmDialog(msg, '⚠️ Конфликты в бренде').then(ok => { if (ok) doSave(); });
    return;
  }

  if (check.existingKey && check.existingKey !== oldKey) {
    const ex = _brandDB[check.existingKey];
    const mergedSyns = [...new Set([...(ex.synonyms||[]), ...syns])];
    const mergedAnti = [...new Set([...(ex.antonyms||[]), ...anti])];
    const warnHtml = check.warnings.length ? brandConflictHtml({ conflicts:[], warnings: check.warnings }) : '';
    const msg = [
      `Бренд <b>«${newKey}»</b> уже существует. ${warnHtml}`,
      `Объединить кросскоды/антонимы с существующим?`
    ].join('<br>');
    jeConfirmDialog(msg, '🔀 Бренд существует').then(function(ok) {
      if (!ok) return;
      if (oldKey && oldKey !== newKey) delete _brandDB[oldKey];
      _brandDB[newKey] = { synonyms: mergedSyns, antonyms: mergedAnti };
      brandCloseEdit(); brandRender(); brandMarkUnsaved();
      showToast(`Бренд «${newKey}» объединён и сохранён`, 'ok');
    });
    return;
  }

  if (check.warnings.length) {
    showToast(`⚠ ${check.warnings[0]}`, 'warn');
  }

  if (oldKey && oldKey !== newKey) delete _brandDB[oldKey];
  _brandDB[newKey] = { synonyms: syns, antonyms: anti };
  brandCloseEdit(); brandRender(); brandMarkUnsaved();
  showToast(`Бренд «${newKey}» сохранён`, 'ok');
}

document.getElementById('brandSearchInp').addEventListener('input', brandRender);

document.getElementById('brandList').addEventListener('click', function(e) {

  if (e.target.closest('button')) return;
  const tr = e.target.closest('tr[data-key]');
  if (!tr) return;
  const key = decodeURIComponent(tr.dataset.key);
  brandOpenEdit(key);
});

document.getElementById('brandClearAllBtn').addEventListener('click', function () {
  if (!Object.keys(_brandDB).length) return;
  jeConfirmDialog('Очистить весь словарь брендов? Это действие нельзя отменить.', '🗑️ Очистить всё').then(function(ok) {
    if (!ok) return;
    _brandDB = {};
    brandRender(); brandMarkUnsaved();
    showToast('Словарь брендов очищен', 'ok');
  });
});

function brandCheckConflicts(newCanon, newSyns, newAnti, skipKey) {
  const result = { existingKey: null, conflicts: [], warnings: [], conflictWords: new Set() };
  if (!newCanon) return result;

  const newSynSet  = new Set(newSyns.map(s => brandNormKey(s)));
  const newAntiSet = new Set(newAnti.map(s => brandNormKey(s)));

  const innerConflict = [...newSynSet].filter(s => newAntiSet.has(s));
  if (innerConflict.length) {
    result.conflicts.push(`Слова одновременно в кросскодах и антонимах: «${innerConflict.join('», «')}»`);
    innerConflict.forEach(w => result.conflictWords.add(w));
  }

  if (newAntiSet.has(newCanon)) {
    result.conflicts.push(`Канонический бренд «${newCanon}» указан в собственных антонимах`);
    result.conflictWords.add(newCanon);
  }

  for (const [key, val] of Object.entries(_brandDB)) {
    if (key === skipKey) continue;
    const exSynSet  = new Set(val.synonyms  || []);
    const exAntiSet = new Set(val.antonyms  || []);

    if (key === newCanon) {
      result.existingKey = key;
      const antiConflicts = [...newSynSet].filter(s => exAntiSet.has(s));
      if (antiConflicts.length) {
        result.conflicts.push(`В бренде «${key}» слова «${antiConflicts.join('», «')}» уже в антонимах, а вы добавляете их как кросскоды`);
        antiConflicts.forEach(w => result.conflictWords.add(w));
      }
      const synConflicts = [...newAntiSet].filter(s => exSynSet.has(s));
      if (synConflicts.length) {
        result.conflicts.push(`В бренде «${key}» слова «${synConflicts.join('», «')}» уже в кросскодах, а вы добавляете их как антонимы`);
        synConflicts.forEach(w => result.conflictWords.add(w));
      }
      continue;
    }

    if (exSynSet.has(newCanon)) {
      result.warnings.push(`«${newCanon}» уже является кросскодом бренда «${key}»`);
    }

    for (const s of newSynSet) {
      if (s === key) {
        result.warnings.push(`Кросскод «${s}» уже является каноническим брендом`);
      }

      if (exSynSet.has(s)) {
        result.warnings.push(`Кросскод «${s}» уже есть у бренда «${key}»`);
      }

      if (exAntiSet.has(s)) {
        result.conflicts.push(`Кросскод «${s}» находится в антонимах бренда «${key}»`);
        result.conflictWords.add(s);
      }
    }

    for (const a of newAntiSet) {
      if (exSynSet.has(a) && key !== newCanon) {
        result.warnings.push(`Антоним «${a}» является кросскодом бренда «${key}»`);
      }
    }
  }

  result.conflicts = [...new Set(result.conflicts)];
  result.warnings  = [...new Set(result.warnings)];
  return result;
}

function brandConflictHtml(check) {
  let html = '';
  if (check.conflicts.length) {
    html += `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:10px 12px;margin-bottom:6px;font-size:12px;line-height:1.7;">
      <b style="font-size:13px;">⚠️ Обнаружены противоречия, исправьте перед сохранением:</b><br><br>
      ${check.conflicts.map(c => `<span style="display:block;padding-left:8px;">• ${c}</span>`).join('')}
    </div>`;
  }
  if (check.warnings.length) {
    html += `<div style="background:#e8f4ff;border:1px solid #90c8f0;border-radius:6px;padding:10px 12px;font-size:12px;line-height:1.7;">
      <b style="font-size:13px;">ℹ️ Предупреждения:</b><br><br>
      ${check.warnings.map(w => `<span style="display:block;padding-left:8px;">• ${w}</span>`).join('')}
    </div>`;
  }
  return html;
}

function brandOpenAddModal() {
  ['brNCanon','brNSyns','brNAnti'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const errEl = document.getElementById('brandFormError');
  if (errEl) { errEl.style.display='none'; errEl.textContent=''; }
  const hintEl = document.getElementById('brNCanonExistHint');
  if (hintEl) { hintEl.style.display='none'; hintEl.innerHTML=''; }
  // ensure spacing between form blocks
  const modal = document.getElementById('brandAddModal');
  if (modal) {
    const fields = modal.querySelectorAll('.modal-field');
    fields.forEach((f, i) => { if (i > 0) f.style.marginTop = '14px'; });
  }
  document.getElementById('brandAddModal').style.display = 'flex';
  setTimeout(() => { const el=document.getElementById('brNCanon'); if(el) el.focus(); }, 50);
}
function brandCloseAddModal() {
  document.getElementById('brandAddModal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function() {

  const _brandEmptyEl = document.getElementById('brandEmpty');
  if (_brandEmptyEl) _brandEmptyEl.setAttribute('data-instr-html', _brandEmptyEl.innerHTML);

  const elMap = {
    'brandOpenAddModalBtn': () => brandOpenAddModal(),
    'brandAddModalCloseX':  () => brandCloseAddModal(),
    'brandAddModalCancel':  () => brandCloseAddModal(),
  };
  Object.entries(elMap).forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  });

  const cfBtn = document.getElementById('brandConflictFilterBtn');
  if (cfBtn) cfBtn.addEventListener('click', function() {
    _brandFilterConflicts = !_brandFilterConflicts;
    brandRender();
  });

  document.getElementById('brandAddBtn') && document.getElementById('brandAddBtn').addEventListener('click', function () {
    const canon = brandNormKey(document.getElementById('brNCanon').value);
    const errEl = document.getElementById('brandFormError');
    errEl.style.display = 'none'; errEl.innerHTML = '';
    if (!canon) { errEl.textContent = 'Укажите канонический бренд'; errEl.style.display = ''; return; }

    const syns = brandParseCsv(document.getElementById('brNSyns').value);
    const anti = brandParseCsv(document.getElementById('brNAnti').value);

    const check = brandCheckConflicts(canon, syns, anti, null);

    function _doSaveBrand() {
      _brandDB[canon] = { synonyms: syns, antonyms: anti };
      ['brNCanon','brNSyns','brNAnti'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      if (errEl) { errEl.style.display = 'none'; errEl.innerHTML = ''; }
      brandCloseAddModal();
      brandRender(); brandMarkUnsaved();
      setTimeout(() => { brandRender(); }, 50);
      if (check.conflicts.length) {
        showToast(`⚠️ Бренд «${canon}» сохранён с конфликтами (${check.conflicts.length})`, 'warn');
      } else {
        showToast(`Бренд «${canon}» добавлен`, 'ok');
      }
    }

    if (check.conflicts.length) {
      const msg = brandConflictHtml(check) + `<div style="margin-top:10px;font-size:13px;">Всё равно сохранить бренд?</div>`;
      jeConfirmDialog(msg, '⚠️ Конфликты в бренде').then(ok => { if (ok) _doSaveBrand(); });
      return;
    }

    if (check.existingKey) {
      // Silently merge if no conflicts — user already saw the inline hint
      const ex = _brandDB[check.existingKey];
      const mergedSyns = [...new Set([...(ex.synonyms||[]), ...syns])];
      const mergedAnti = [...new Set([...(ex.antonyms||[]), ...anti])];
      _brandDB[canon] = { synonyms: mergedSyns, antonyms: mergedAnti };
      ['brNCanon','brNSyns','brNAnti'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      brandCloseAddModal();
      brandRender(); brandMarkUnsaved();
      setTimeout(() => { brandRender(); }, 50);
      const addedSyns = syns.filter(s => !(ex.synonyms||[]).includes(s));
      const addedAnti = anti.filter(a => !(ex.antonyms||[]).includes(a));
      const parts = [];
      if (addedSyns.length) parts.push(`+${addedSyns.length} кросскод${addedSyns.length>1?'а':''}`);
      if (addedAnti.length) parts.push(`+${addedAnti.length} антоним${addedAnti.length>1?'а':''}`);
      showToast(`Бренд «${canon}» обновлён` + (parts.length ? ` (${parts.join(', ')})` : ''), 'ok');
      return;
    }

    if (check.warnings.length) {
      const msg = brandConflictHtml({ conflicts: [], warnings: check.warnings })
        + `<div style="margin-top:8px;">Всё равно создать новый бренд?</div>`;
      jeConfirmDialog(msg, '⚠️ Возможные пересечения').then(function(ok) {
        if (ok) _doSaveBrand();
      });
      return;
    }

    _doSaveBrand();
  });

  // Live hint: show when canon brand already exists in DB
  const _brNCanonEl = document.getElementById('brNCanon');
  if (_brNCanonEl) {
    _brNCanonEl.addEventListener('input', function() {
      const hintEl = document.getElementById('brNCanonExistHint');
      if (!hintEl) return;
      const val = brandNormKey(this.value);
      if (!val || !_brandDB[val]) { hintEl.style.display = 'none'; hintEl.innerHTML = ''; return; }
      const ex = _brandDB[val];
      const exSyns = (ex.synonyms||[]).join(', ') || '—';
      const exAnti = (ex.antonyms||[]).join(', ') || '—';
      hintEl.innerHTML = `ℹ️ Бренд <b>«${val}»</b> уже есть в базе. `
        + `Кросскоды: <b>${exSyns}</b>. Антонимы: <b style="color:var(--red)">${exAnti}</b>.<br>`
        + `<span style="color:#3059A8;">Добавьте кросскоды или антонимы ниже — они будут объединены с существующими.</span>`;
      hintEl.style.display = '';
    });
  }

  document.getElementById('brandClearFormBtn') && document.getElementById('brandClearFormBtn').addEventListener('click', function () {
    ['brNCanon','brNSyns','brNAnti'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('brandFormError').style.display = 'none';
  });

  const bcModal = document.getElementById('bcAddModal');
  if (bcModal) bcModal.addEventListener('click', e => { if (e.target === bcModal) closeBcAddModal(); });
  const bcCloseX = document.getElementById('bcAddCloseX');
  if (bcCloseX) bcCloseX.addEventListener('click', closeBcAddModal);
  const bcCancel = document.getElementById('bcAddCancelBtn');
  if (bcCancel) bcCancel.addEventListener('click', closeBcAddModal);
  const bcSave = document.getElementById('bcAddSaveBtn');
  if (bcSave) bcSave.addEventListener('click', saveBcAddModal);
});

function openAddToDB(barcode, btnEl) {

  const item = groupedData.find(d => String(d.barcode) === String(barcode));
  if (!item) return;

  const _bcAlreadyInDB = jeDB[barcode] !== undefined
    || (typeof barcodeAliasMap !== 'undefined' && barcodeAliasMap.has(String(barcode)));
  if (_bcAlreadyInDB) { showToast('Штрихкод уже есть в базе', 'info'); return; }

  const synonymOptions = [];
  if (item.originalBarcodesByFile) {
    item.originalBarcodesByFile.forEach((bc, fileName) => {
      if (String(bc) !== String(barcode)) {
        synonymOptions.push({ bc: String(bc), fileName });
      }
    });
  }

  const bestName = (item.namesByFile && item.namesByFile.get(MY_PRICE_FILE_NAME))
    || (item.names && item.names[0] && item.names[0].name) || '';

  _bcAddState = { mainBC: barcode, synonyms: synonymOptions };

  document.getElementById('bcAddMainBC').value = barcode;
  document.getElementById('bcAddName').value = bestName;

  const _yBtn = document.getElementById('bcYandexMainBtn');
  if (_yBtn) _yBtn.onclick = () => window.open('https://yandex.ru/search?text=' + encodeURIComponent(bestName || barcode) + '&lr=197&from=tabbar&products_mode=1', '_blank');

  const list = document.getElementById('bcAddSynList');
  if (synonymOptions.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:11px;font-style:italic;">Нет кросскодов от поставщиков</div>';
  } else {
    const _ySvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#FF0000" xmlns="http://www.w3.org/2000/svg"><path d="M12.87 13.32L16.5 5h-2.22l-2.07 5.46L10.17 5H7.95l3.24 8.32L7.95 19h2.22l2.13-5.56L14.43 19h2.22z"/><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 1.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z"/></svg>`;
    list.innerHTML = synonymOptions.map((s, i) => `
      <label class="bc-modal-syn-row">
        <input type="checkbox" data-syi="${i}" checked>
        <span class="bc-modal-syn-bc">${s.bc}</span>
        <span class="bc-modal-syn-file">${s.fileName}</span>
        <button type="button" class="btn" style="flex-shrink:0;padding:0 7px;height:24px;border-color:#FF0000;color:#FF0000;margin-left:auto;" title="Найти товар на Яндексе" onclick="event.preventDefault();event.stopPropagation();window.open('https://yandex.ru/search?text='+encodeURIComponent('${s.bc.replace(/'/g,"\\'")}')+'&lr=197&from=tabbar&products_mode=1','_blank')">${_ySvg}</button>
      </label>`).join('');
  }

  document.getElementById('bcAddModal').style.display = 'flex';
  setTimeout(() => document.getElementById('bcAddName').focus(), 50);
}

function closeBcAddModal() {
  document.getElementById('bcAddModal').style.display = 'none';
  _bcAddState = null;
}

function saveBcAddModal() {
  if (!_bcAddState) return;
  const mainBC = document.getElementById('bcAddMainBC').value.trim();
  if (!mainBC) { showToast('Штрихкод не может быть пустым', 'warn'); return; }
  if (jeDB[mainBC] !== undefined) { showToast('Штрихкод уже есть в базе', 'warn'); return; }
  const name = document.getElementById('bcAddName').value.trim() || mainBC;

  const checkedSyns = [];
  document.querySelectorAll('#bcAddSynList input[type=checkbox]:checked').forEach(cb => {
    const i = parseInt(cb.dataset.syi, 10);
    const s = _bcAddState.synonyms[i];
    if (s) checkedSyns.push(s.bc);
  });

  jeDBSaveHistory();
  jeDB[mainBC] = [name, ...checkedSyns];
  jeDBNotifyChange();
  jeRenderEditor(true);

  unifiedMarkUnsaved();
  closeBcAddModal();
  showToast(`Группа «${mainBC}» добавлена в базу`, 'ok');
  setTimeout(() => jeScrollToKey(mainBC), 60);

  if (typeof _mvsRenderVisible === 'function') _mvsRenderVisible();
}

window.closeMatchModal = closeMatchModal;
window.confirmMatchAction = confirmMatchAction;
window.jeConfirmClose = jeConfirmClose;
window.jeXlsModalClose = jeXlsModalClose;
window.brandOpenEdit = brandOpenEdit;
window.brandCloseEdit = brandCloseEdit;
window.brandSaveEdit = brandSaveEdit;
window.brandDelete = brandDelete;
window.brandOpenAddModal = brandOpenAddModal;
window.brandCloseAddModal = brandCloseAddModal;
window.openAddToDB = openAddToDB;
window.closeBcAddModal = closeBcAddModal;
window.brandRender = brandRender;
window.brandMarkUnsaved = brandMarkUnsaved;

brandRender();

window._matcherUpdateJsonInfo = function() {
  const jsonRow = document.getElementById('matcherJsonRow');
  const jsonLabel = document.getElementById('matcherJsonLabel');
  if (!jsonRow || !jsonLabel) return;
  const hasSynonyms = typeof jeDB !== 'undefined' && Object.keys(jeDB).length > 0;
  const sfName = document.getElementById('sfJsonName');
  const fileName = sfName && sfName.textContent !== 'JSON не загружен' ? sfName.textContent : null;
  if (fileName || hasSynonyms) {
    jsonRow.style.display = '';
    const count = Object.keys(jeDB || {}).length;
    jsonLabel.innerHTML = `<strong>${fileName || 'JSON'}</strong> — ${count} записей`;
  } else {
    jsonRow.style.display = 'none';
  }
};

(function() {
  const chk = document.getElementById('matcherJsonEnabled');
  if (chk) {
    chk.addEventListener('change', function() {
      const row = document.getElementById('matcherJsonToggleRow');
      if (row) row.classList.toggle('disabled', !chk.checked);
      if (typeof _matcherMarkDirty === 'function') _matcherMarkDirty();
    });
  }
})();

// [removed duplicate synonymsInput listener - AppBridge.emit already called in primary handler]

function toggleSidebar() {
  const sidebar = document.querySelector('.app-sidebar');
  const collapsed = sidebar.classList.toggle('collapsed');
  localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  document.getElementById('sidebarToggle').title = collapsed ? 'Развернуть меню' : 'Свернуть меню';
}

(function() {
  if (localStorage.getItem('sidebarCollapsed') === '1') {
    const sidebar = document.querySelector('.app-sidebar');
    if (sidebar) {
      sidebar.classList.add('collapsed');
      const btn = document.getElementById('sidebarToggle');
      if (btn) btn.title = 'Развернуть меню';
    }
  }
})();

(function() {
  function sfShorten(name, max) {
    if (!name) return '';
    return name.length > max ? name.slice(0, max - 1) + '…' : name;
  }

  function sfUpdateJson(fileName, entryCount) {
    const item = document.getElementById('sfJsonItem');
    const nameEl = document.getElementById('sfJsonName');
    const badge = document.getElementById('sfJsonBadge');
    const meta = document.getElementById('sfJsonMeta');
    if (!item) return;
    if (fileName) {
      item.classList.remove('sidebar-file-item--empty');
      item.classList.add('sidebar-file-item--loaded');
      nameEl.textContent = sfShorten(fileName, 22);
      badge.style.display = '';
      if (entryCount != null) {
        meta.style.display = '';
        meta.innerHTML = '<strong>' + entryCount + '</strong> записей в базе';
      }
    } else {
      item.classList.add('sidebar-file-item--empty');
      item.classList.remove('sidebar-file-item--loaded');
      nameEl.textContent = 'JSON не загружен';
      badge.style.display = 'none';
      meta.style.display = 'none';
    }
  }

  function sfUpdateMyPrice(fileName, rows) {
    const item = document.getElementById('sfMyPriceItem');
    const nameEl = document.getElementById('sfMyPriceName');
    const badge = document.getElementById('sfMyPriceBadge');
    const meta = document.getElementById('sfMyPriceMeta');
    if (!item) return;
    if (fileName) {
      item.classList.remove('sidebar-file-item--empty');
      item.classList.add('sidebar-file-item--myprice');
      nameEl.textContent = sfShorten(fileName, 22);
      badge.style.display = '';
      if (rows != null) {
        meta.style.display = '';
        meta.innerHTML = '<strong>' + rows.toLocaleString('ru') + '</strong> строк';
      }
    } else {
      item.classList.add('sidebar-file-item--empty');
      item.classList.remove('sidebar-file-item--myprice');
      nameEl.textContent = 'Мой прайс не загружен';
      badge.style.display = 'none';
      meta.style.display = 'none';
    }
  }

  function sfUpdateSuppliers(list) {

    const emptyEl = document.getElementById('sfSuppliersEmpty');
    const listEl = document.getElementById('sfSuppliersList');
    if (!listEl) return;
    if (!list || list.length === 0) {
      emptyEl.style.display = '';
      listEl.style.display = 'none';
      listEl.innerHTML = '';
      return;
    }
    emptyEl.style.display = 'none';
    listEl.style.display = '';
    listEl.innerHTML = list.map(f => `
      <div class="sidebar-file-item sidebar-file-item--supplier">
        <div class="sf-row sf-supplier-row">
          <span class="sf-icon">📦</span>
          <span class="sf-name" title="${f.name.replace(/"/g,'&quot;')}">${f.name.length > 18 ? f.name.slice(0,17) + '…' : f.name}</span>
          <span class="sf-type sf-type--supplier">CSV</span>
          <button class="sf-supplier-del" title="Удалить файл поставщика" onclick="removeSupplierFile('${f.name.replace(/'/g,"\\'")}')">✕</button>
        </div>
      </div>`).join('');
  }

  function _monitorUpdateSupplierList(list) {
    const el = document.getElementById('monitorSupplierFileList');
    if (!el) return;
    if (!list || list.length === 0) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = '';
    el.innerHTML = list.map(f => `
      <div class="sup-file-row">
        <span class="sup-file-row-name" title="${f.name.replace(/"/g,'&quot;')}">📦 ${f.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
        <button class="sup-file-row-del" title="Удалить файл поставщика" onclick="removeSupplierFile('${f.name.replace(/'/g,"\\'")}')">✕</button>
      </div>`).join('');
  }

  window._sfUpdateJson = sfUpdateJson;
  window._sfUpdateMyPrice = sfUpdateMyPrice;
  window._sfUpdateSuppliers = function(list) {
    sfUpdateSuppliers(list);
    _monitorUpdateSupplierList(list);
  };

  function watchStatus(id, cb) {
    const el = document.getElementById(id);
    if (!el) return;
    const obs = new MutationObserver(() => cb(el.textContent));
    obs.observe(el, { childList: true, subtree: true, characterData: true });
  }

  watchStatus('synonymsStatus', function(txt) {
    if (txt && txt !== 'Не загружены' && txt !== 'Не загружена') {

      const match = txt.match(/(.+?)\s*[\(—]/);
      sfUpdateJson(match ? match[1].trim() : txt, null);
    } else {
      sfUpdateJson(null, null);
    }
  });

  watchStatus('myPriceStatus', function(txt) {
    if (txt && txt !== 'Не загружен') {
      const rowMatch = txt.match(/(\d[\d\s]*)\s*строк/);
      const rows = rowMatch ? parseInt(rowMatch[1].replace(/\s/g, '')) : null;
      const nameMatch = txt.match(/^(.+?)\s*[\(—\|]/);
      sfUpdateMyPrice(nameMatch ? nameMatch[1].trim() : txt, rows);
    } else {
      sfUpdateMyPrice(null, null);
    }
  });

  if (typeof AppBridge !== 'undefined') {
    AppBridge.on('settingsLoaded', function(json) {
      const count = json && json.synonyms ? Object.keys(json.synonyms).length : null;
      const sfName = document.getElementById('sfJsonName');
      if (sfName && sfName.textContent !== 'JSON не загружен') {
        const meta = document.getElementById('sfJsonMeta');
        if (meta && count != null) {
          meta.style.display = '';
          meta.innerHTML = '<strong>' + count + '</strong> записей в базе';
        }
      }

      setTimeout(function() {
        if (typeof window._matcherUpdateJsonInfo === 'function') window._matcherUpdateJsonInfo();
      }, 200);
    });
  }

  watchStatus('synonymsStatus', function() {
    setTimeout(function() {
      if (typeof window._matcherUpdateJsonInfo === 'function') window._matcherUpdateJsonInfo();
    }, 300);
  });
})();


(function() {

  var modal = document.getElementById('confirmClearModal');
  var btnOk = document.getElementById('confirmClearOk');
  var btnCancel = document.getElementById('confirmClearCancel');

  var clearBtn2 = document.getElementById('clearBtn');
  if (clearBtn2) {

    clearBtn2.addEventListener('click', function pmClearInterceptor(e) {
      if (clearBtn2.disabled) return;
      e.stopImmediatePropagation();
      modal.style.display = 'flex';
    }, true);

  }
  btnCancel.addEventListener('click', function() { modal.style.display = 'none'; });
  btnOk.addEventListener('click', function() {
    modal.style.display = 'none';
    if (typeof clearAll === 'function') clearAll();
    _pmDB_clearSession();
  });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.style.display = 'none'; });

  var _PM_DB_NAME = 'PriceManager', _PM_DB_VER = 1, _PM_STORE = 'session';
  var _pmIDB = null;
  window._pmDB_open = function(cb) {
    if (_pmIDB) { cb(_pmIDB); return; }
    var req = indexedDB.open(_PM_DB_NAME, _PM_DB_VER);
    req.onupgradeneeded = function(e) { e.target.result.createObjectStore(_PM_STORE); };
    req.onsuccess = function(e) { _pmIDB = e.target.result; cb(_pmIDB); };
    req.onerror = function() { cb(null); };
  };
  window._pmDB_set = function(key, value) {
    _pmDB_open(function(db) { if (!db) return; db.transaction(_PM_STORE,'readwrite').objectStore(_PM_STORE).put(value, key); });
  };
  window._pmDB_get = function(key, cb) {
    _pmDB_open(function(db) {
      if (!db) { cb(null); return; }
      var req = db.transaction(_PM_STORE,'readonly').objectStore(_PM_STORE).get(key);
      req.onsuccess = function() { cb(req.result); };
      req.onerror = function() { cb(null); };
    });
  };
  window._pmDB_clearSession = function() {
    _pmDB_open(function(db) { if (!db) return; db.transaction(_PM_STORE,'readwrite').objectStore(_PM_STORE).clear(); });
  };

  var _pmSaveTimer = null;
  window._pmScheduleSave = function() {
    clearTimeout(_pmSaveTimer);
    _pmSaveTimer = setTimeout(function() {
      try {
        var pm = window._pmApp;
        if (!pm) return;
        var mpd = pm.myPriceData;
        var cfd = pm.competitorFilesData;
        var jeDBCopy = (typeof jeDB !== 'undefined') ? JSON.parse(JSON.stringify(jeDB)) : null;
        var hasData = (mpd && mpd.data && mpd.data.length) || (cfd && cfd.length > 0) || (jeDBCopy && Object.keys(jeDBCopy).length > 0);
        if (!hasData) { _pmDB_clearSession(); return; }
        var matchPairs = [];
        try { if (typeof _matchActivePairs !== 'undefined' && _matchActivePairs.length) matchPairs = _matchActivePairs; } catch(e){}
        var brandDBCopy = null;
        try { if (typeof _brandDB !== 'undefined' && Object.keys(_brandDB).length > 0) brandDBCopy = JSON.parse(JSON.stringify(_brandDB)); } catch(e){}
        var session = {
          ts: Date.now(),
          myPriceData: mpd ? { fileName: mpd.fileName, isMyPrice: true, data: mpd.data } : null,
          competitorFilesData: (cfd||[]).map(function(f){ return { fileName: f.fileName, isMyPrice: false, data: f.data }; }),
          jeDB: jeDBCopy,
          brandDB: brandDBCopy,
          matchActivePairs: matchPairs.length ? matchPairs : undefined,
          obrArchiveFiles: (window._obrArchiveFiles && window._obrArchiveFiles.length) ? window._obrArchiveFiles.slice() : undefined,
          categoryWords: (typeof _catWordsBase !== 'undefined' && _catWordsBase.size > 0) ? [..._catWordsBase].sort() : undefined
        };
        _pmDB_set('session', session);

        if (typeof showToast === 'function') {
          var _saveToast = document.getElementById('_autoSaveToast');
          if (!_saveToast) {
            _saveToast = document.createElement('div');
            _saveToast.id = '_autoSaveToast';
            Object.assign(_saveToast.style, {
              position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%) translateY(10px)',
              background: '#1e293b', color: '#94a3b8', fontSize: '11px', fontFamily: 'Inter,sans-serif',
              padding: '5px 14px', borderRadius: '99px', zIndex: '99996',
              opacity: '0', transition: 'opacity .3s, transform .3s', pointerEvents: 'none',
              border: '1px solid #334155', whiteSpace: 'nowrap'
            });
            document.body.appendChild(_saveToast);
          }
          _saveToast.textContent = '💾 Сессия сохранена';
          _saveToast.style.opacity = '1';
          _saveToast.style.transform = 'translateX(-50%) translateY(0)';
          clearTimeout(_saveToast._t);
          _saveToast._t = setTimeout(function() {
            _saveToast.style.opacity = '0';
            _saveToast.style.transform = 'translateX(-50%) translateY(10px)';
          }, 2000);
        }
      } catch(e) {}
    }, 2000);
  };

  (function waitForPmApp(attempts) {
    var pm = window._pmApp;
    if (pm && pm.processAllData) {
      var _orig = pm.processAllData.bind(pm);
      pm.processAllData = function() { _orig(); window._pmScheduleSave(); };
    } else if (attempts > 0) {
      setTimeout(function() { waitForPmApp(attempts - 1); }, 100);
    }
  })(20);

  window.addEventListener('load', function() {
    setTimeout(function() {
      _pmDB_get('session', function(session) {
        if (!session || !session.ts) return;
        var mpRows = session.myPriceData && session.myPriceData.data ? session.myPriceData.data.length : 0;
        var cfCount = session.competitorFilesData ? session.competitorFilesData.length : 0;
        var jeCount = session.jeDB ? Object.keys(session.jeDB).length : 0;
        if (mpRows === 0 && cfCount === 0 && jeCount === 0) return;

        try {
          var pm = window._pmApp;
          if (!pm) return;
          if (session.jeDB && typeof jeDB !== 'undefined') {
            Object.keys(jeDB).forEach(function(k){ delete jeDB[k]; });
            Object.assign(jeDB, session.jeDB);
            if (typeof rebuildBarcodeAliasFromJeDB === 'function') rebuildBarcodeAliasFromJeDB();
            if (typeof jeRenderEditor === 'function') jeRenderEditor();
            if (typeof jeUpdateStatus === 'function') jeUpdateStatus();
            var sn = Object.keys(session.jeDB).length;
            var synSt = document.getElementById('synonymsStatus');
            if (synSt) { synSt.className='upload-status upload-status--ok'; synSt.textContent='Групп: '+sn; }
            if (typeof _sfUpdateJson === 'function') _sfUpdateJson('База кросскодов', sn);
            if (typeof _slotShowJsonChip === 'function') _slotShowJsonChip('База кросскодов', sn);
          }

          if (session.brandDB && typeof _brandDB !== 'undefined') {
            try {
              Object.keys(_brandDB).forEach(function(k){ delete _brandDB[k]; });
              Object.assign(_brandDB, session.brandDB);
              if (typeof brandRender === 'function') brandRender();
              var brBadge = document.getElementById('brandCountBadge');
              if (brBadge) brBadge.textContent = Object.keys(_brandDB).length;
            } catch(be) {}
          }
          if (session.categoryWords && session.categoryWords.length && typeof _catWordsBase !== 'undefined') {
            try {
              _catWordsBase = new Set(session.categoryWords.map(function(s){ return String(s).toLowerCase().trim(); }).filter(Boolean));
              if (typeof _catWordsExpandFromBase === 'function') _catWordsExpandFromBase();
              if (typeof _catExclUpdateBadge === 'function') _catExclUpdateBadge();
            } catch(ce) {}
          }
          if (session.myPriceData && session.myPriceData.data) {
            pm.myPriceData = session.myPriceData;
            var mpSt = document.getElementById('myPriceStatus');
            if (mpSt) { mpSt.className='upload-status upload-status--ok'; mpSt.textContent=session.myPriceData.fileName; }
            if (typeof _sfUpdateMyPrice === 'function') _sfUpdateMyPrice(session.myPriceData.fileName, session.myPriceData.data.length);
            if (typeof _slotShowMyPriceChip === 'function') _slotShowMyPriceChip(session.myPriceData.fileName, session.myPriceData.data.length);
          }
          if (session.competitorFilesData && session.competitorFilesData.length) {
            pm.competitorFilesData = session.competitorFilesData.slice();
            var n = pm.competitorFilesData.length;
            var cSt = document.getElementById('competitorStatus');
            if (cSt) { cSt.className='upload-status upload-status--ok'; cSt.textContent=n+' файл'+(n===1?'':'а'+(n<5?'':'ов')); }
            if (typeof _sfUpdateSuppliers === 'function') _sfUpdateSuppliers(pm.competitorFilesData.map(function(f){ return {name:f.fileName,rows:f.data?f.data.length:null}; }));
            if (typeof _slotHideCompetitorStatus === 'function') _slotHideCompetitorStatus();
          }

          if (session.obrArchiveFiles && session.obrArchiveFiles.length && window._obrArchiveFiles) {
            try {
              window._obrArchiveFiles.splice(0, window._obrArchiveFiles.length, ...session.obrArchiveFiles);
            } catch(ae) {}
          }
          if (session.myPriceData || session.competitorFilesData) {
            window._pmRestoringSession = true;
            pm.processAllData();
            window._pmRestoringSession = false;
          }

          if (window._obrArchiveFiles && window._obrArchiveFiles.length) {
            var _abBtn = document.getElementById('obrHeaderArchiveBtn');
            var _mabBtn = document.getElementById('monitorDownloadArchiveBtn');
            if (_abBtn) _abBtn.disabled = false;
            if (_mabBtn) _mabBtn.disabled = false;

            setTimeout(function() {
              if (_abBtn) _abBtn.disabled = false;
              if (_mabBtn) _mabBtn.disabled = false;
            }, 200);
          }

          if (session.matchActivePairs && session.matchActivePairs.length) {
            try {
              if (typeof _matchActivePairs !== 'undefined') {

                _matchActivePairs.splice(0, _matchActivePairs.length, ...session.matchActivePairs);
                if (typeof renderMatcherTable === 'function') {
                  var mWrap = document.getElementById('matcherTableWrap');
                  var mEmpty = document.getElementById('matcherEmpty');
                  var mStats = document.getElementById('matcherStats');
                  var mSearchInp = document.getElementById('matcherSearchInp');
                  if (mWrap) mWrap.style.display = '';
                  if (mEmpty) mEmpty.style.display = 'none';
                  if (mStats) mStats.style.display = 'flex';
                  var mSearch = document.getElementById('matcherSearchRow');
                  if (mSearch) mSearch.style.display = '';
                  if (mSearchInp) mSearchInp.disabled = false;
                  if (typeof updateMatcherStats === 'function') updateMatcherStats();
                  if (typeof setMatchView === 'function') setMatchView(_matchCurrentView || 'all');
                  else renderMatcherTable();
                  if (typeof matcherFileChipsRender === 'function') matcherFileChipsRender();
                }
              }
            } catch(me) {}
          }

          var parts = [];
          if (mpRows > 0) parts.push('📋 ' + session.myPriceData.fileName + ' (' + mpRows + ' строк)');
          if (cfCount > 0) parts.push('📦 ' + cfCount + ' поставщик' + (cfCount === 1 ? '' : (cfCount < 5 ? 'а' : 'ов')));
          if (jeCount > 0) parts.push('🔑 JSON: ' + jeCount + ' групп');
          if (session.categoryWords && session.categoryWords.length) parts.push('🏷 ' + session.categoryWords.length + ' категор' + (session.categoryWords.length === 1 ? 'ия' : (session.categoryWords.length < 5 ? 'ии' : 'ий')));
          if (session.matchActivePairs && session.matchActivePairs.length) parts.push('🔀 ' + session.matchActivePairs.length + ' пар поиска');
          var age = Math.round((Date.now() - session.ts) / 60000);
          var ageStr = age < 1 ? 'только что' : age < 60 ? age + ' мин. назад' : Math.round(age/60) + ' ч. назад';
          if (typeof showToast === 'function') showToast('✅ Сессия восстановлена (' + ageStr + '): ' + parts.join(', '), 'ok');
          if (typeof _updatePriceCardsLock === 'function') _updatePriceCardsLock();
        } catch(e) {
          if (typeof showToast === 'function') showToast('⚠️ Не удалось восстановить сессию', 'err');
        }
      });
    }, 600);
  });
})();



(function() {
'use strict';

/* ════════════════════════════════════════════════════
   1. STICKY FILTERS — persist active filters across tab switches
   ════════════════════════════════════════════════════ */
var _stickyState = {
  sortMode: 'default',
  filterNewItems: false,
  showMinPriceMode: false,
  compactMatches: true,
  searchQuery: '',
  deltaActive: false,
  deltaMin: '',
  deltaMax: '',
  deltaDir: 'cheaper',
  deltaColA: '__myprice',
  deltaColB: '__best'
};

// Снять все фильтры через кнопку «Сбросить все»
var _stickyBarResetBtn = document.getElementById('stickyBarResetBtn');
if (_stickyBarResetBtn) {
  _stickyBarResetBtn.addEventListener('click', function() {
    // Reset search
    var si = document.getElementById('searchInput');
    if (si) { si.value = ''; }
    // Click bigDiff if active to toggle off
    var bigDiffBtn = document.getElementById('bigDiffBtn');
    var showMyPriceBtn = document.getElementById('showMyPriceBtn');
    var maxCoverageBtn = document.getElementById('maxCoverageBtn');
    var minPriceBtn = document.getElementById('minPriceBtn');
    // Call window-level clear function if available
    if (typeof window._monitorClearAllFilters === 'function') {
      window._monitorClearAllFilters();
    }
    // Reset delta
    resetDeltaFilter();
    updateStickyBar();
  });
}

function updateStickyBar() {
  var bar = document.getElementById('monitorStickyBar');
  var chipsEl = document.getElementById('stickyBarChips');
  if (!bar || !chipsEl) return;

  var chips = [];

  var si = document.getElementById('searchInput');
  if (si && si.value.trim()) chips.push('🔍 "' + si.value.trim().slice(0,20) + '"');

  var catSel = document.getElementById('categoryFilterSelect');
  if (catSel && catSel.value) chips.push('🏷 ' + (catSel.options[catSel.selectedIndex].textContent || catSel.value));

  var bigDiffBtn = document.getElementById('bigDiffBtn');
  if (bigDiffBtn && bigDiffBtn.classList.contains('active')) chips.push('📊 Большая разница');

  var showMyPriceBtn = document.getElementById('showMyPriceBtn');
  if (showMyPriceBtn && showMyPriceBtn.classList.contains('active')) chips.push('📋 Мой прайс');

  var maxCoverageBtn = document.getElementById('maxCoverageBtn');
  if (maxCoverageBtn && maxCoverageBtn.classList.contains('active')) chips.push('🆕 Новинки');

  var minPriceBtn = document.getElementById('minPriceBtn');
  if (minPriceBtn && minPriceBtn.classList.contains('active')) chips.push('⬇ Мин. цена');

  if (window._deltaFilterActive) {
    var d = window._deltaFilterState || {};
    var dirLabel = d.dir === 'cheaper' ? '↓ Дешевле' : d.dir === 'pricier' ? '↑ Дороже' : '↕ Любое';
    var rangeLabel = '';
    if (d.min !== '' && d.max !== '') rangeLabel = ' ' + d.min + '–' + d.max + '%';
    else if (d.min !== '') rangeLabel = ' >' + d.min + '%';
    else if (d.max !== '') rangeLabel = ' <' + d.max + '%';
    chips.push('Δ' + rangeLabel + ' ' + dirLabel);
  }

  if (chips.length === 0) {
    bar.classList.remove('show');
    return;
  }

  chipsEl.innerHTML = chips.map(function(c) {
    return '<span class="restore-column-btn" style="cursor:default;">' + c + '</span>';
  }).join('');
  bar.classList.add('show');
}

// Обновлять sticky bar при каждом переключении вкладки
var _origSwitchMainPane = window.switchMainPane;
window.switchMainPane = function(name) {
  if (typeof _origSwitchMainPane === 'function') _origSwitchMainPane(name);
  if (name === 'monitor') {
    setTimeout(updateStickyBar, 80);
  }
};

// Обновлять sticky bar при каждом нажатии на кнопку фильтра
['bigDiffBtn','showMyPriceBtn','maxCoverageBtn','minPriceBtn','compactMatchesBtn'].forEach(function(id) {
  var btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', function() { setTimeout(updateStickyBar, 50); });
});
var _si = document.getElementById('searchInput');
if (_si) _si.addEventListener('input', function() { setTimeout(updateStickyBar, 50); });

// Update sticky bar on category filter change
var _catSelSB = document.getElementById('categoryFilterSelect');
if (_catSelSB) _catSelSB.addEventListener('change', function() { setTimeout(updateStickyBar, 50); });

// Экспортируем updateStickyBar чтобы delta-фильтр тоже мог обновлять
window._updateStickyBar = updateStickyBar;

// Экспортируем функцию сброса всех фильтров через btn
window._monitorClearAllFilters = function() {
  // Reset search — update both the DOM value AND the internal searchQuery variable
  var si = document.getElementById('searchInput');
  if (si) {
    si.value = '';
    // Dispatch input event so handleSearch() fires and updates searchQuery + re-renders
    si.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Reset category filter
  var catSel = document.getElementById('categoryFilterSelect');
  if (catSel && catSel.value) {
    catSel.value = '';
    catSel.style.background = 'var(--surface)';
    catSel.style.borderColor = 'var(--border-strong)';
    catSel.style.color = 'var(--text-primary)';
    catSel.style.fontWeight = '';
    catSel.dispatchEvent(new Event('change'));
  }
  // Reset minPrice highlight explicitly (full reset)
  var minPriceBtnEl = document.getElementById('minPriceBtn');
  if (minPriceBtnEl && minPriceBtnEl.classList.contains('active')) minPriceBtnEl.click();
  // Trigger filterBtns reset via existing buttons if active
  ['bigDiffBtn','showMyPriceBtn','maxCoverageBtn'].forEach(function(id) {
    var btn = document.getElementById(id);
    if (btn && btn.classList.contains('active')) btn.click();
  });
};

/* ════════════════════════════════════════════════════
   2. DELTA % FILTER
   Логика: берём цену колонки A и B для каждой строки,
   вычисляем дельту (B-A)/A*100, применяем условие.
   ════════════════════════════════════════════════════ */
window._deltaFilterActive = false;
window._deltaFilterState = { min: '', max: '', dir: 'cheaper', colA: '__myprice', colB: '__best' };

var deltaFilterBtn = document.getElementById('deltaFilterBtn');
var deltaPanelWrap = document.getElementById('deltaPanelWrap');
var deltaApplyBtn  = document.getElementById('deltaApplyBtn');
var deltaResetBtn  = document.getElementById('deltaResetBtn');
var deltaDirCheaper = document.getElementById('deltaDirCheaper');
var deltaDirPricier = document.getElementById('deltaDirPricier');
var deltaMin = document.getElementById('deltaMin');
var deltaMax = document.getElementById('deltaMax');
var deltaColA = document.getElementById('deltaColA');
var deltaColB = document.getElementById('deltaColB');

var _currentDeltaDir = 'cheaper';

function setDeltaDir(dir) {
  _currentDeltaDir = dir;
  deltaDirCheaper.className = 'delta-dir-btn' + (dir === 'cheaper' ? ' active-cheaper' : '');
  deltaDirPricier.className = 'delta-dir-btn' + (dir === 'pricier' ? ' active-pricier' : '');
}

if (deltaDirCheaper) deltaDirCheaper.addEventListener('click', function() { setDeltaDir('cheaper'); });
if (deltaDirPricier) deltaDirPricier.addEventListener('click', function() { setDeltaDir('pricier'); });

// Заполнить selects при появлении данных
window._deltaPopulateSelects = function(allCols) {
  if (!deltaColA || !deltaColB) return;

  // Только ценовые колонки (не остаток, не транзит, не кастом)
  var priceCols = allCols.filter(function(col) {
    if (col.metaType) return false; // убираем остаток, транзит, кастом
    return true;
  });

  // ColA: «Мой прайс» (агрегированный) + ценовые колонки (но не те что fileName === MY_PRICE_FILE_NAME — они уже суммарно в __myprice)
  var aOpts = '<option value="__myprice">Мой прайс</option>';
  priceCols.forEach(function(col) {
    if (col.fileName === (typeof MY_PRICE_FILE_NAME !== 'undefined' ? MY_PRICE_FILE_NAME : 'Мой прайс')) return; // не дублируем Мой прайс
    var label = (col.displayName || col.columnName).replace(/"/g,'&quot;');
    aOpts += '<option value="' + col.key + '">' + label + '</option>';
  });

  // ColB: «Лучший поставщик» + только колонки поставщиков
  var bOpts = '<option value="__best">Лучший поставщик (мин)</option>';
  priceCols.forEach(function(col) {
    if (col.fileName === (typeof MY_PRICE_FILE_NAME !== 'undefined' ? MY_PRICE_FILE_NAME : 'Мой прайс')) return; // убираем мой прайс из ColB
    var label = (col.displayName || col.columnName).replace(/"/g,'&quot;');
    bOpts += '<option value="' + col.key + '">' + label + '</option>';
  });

  deltaColA.innerHTML = aOpts;
  deltaColB.innerHTML = bOpts;
};

if (deltaFilterBtn) {
  deltaFilterBtn.addEventListener('click', function() {
    var isOpen = deltaPanelWrap.classList.contains('open');
    if (isOpen) {
      deltaPanelWrap.classList.remove('open');
      deltaFilterBtn.classList.remove('active');
    } else {
      deltaPanelWrap.classList.add('open');
      deltaFilterBtn.classList.add('active');
      // Populate column selects from current allColumns
      if (typeof allColumns !== 'undefined') {
        window._deltaPopulateSelects(allColumns);
      }
    }
  });
}

function resetDeltaFilter() {
  window._deltaFilterActive = false;
  window._deltaFilterState = { min: '', max: '', dir: 'cheaper', colA: '__myprice', colB: '__best' };
  if (deltaMin) deltaMin.value = '';
  if (deltaMax) deltaMax.value = '';
  if (deltaColA) deltaColA.value = '__myprice';
  if (deltaColB) deltaColB.value = '__best';
  setDeltaDir('cheaper');
  if (deltaPanelWrap) deltaPanelWrap.classList.remove('open');
  if (deltaFilterBtn) deltaFilterBtn.classList.remove('active', 'active-warn');
  // Re-render
  if (typeof renderTable === 'function') renderTable();
  if (typeof window._deltaHighlightCols === 'function') setTimeout(window._deltaHighlightCols, 50);
  if (typeof window._updateStickyBar === 'function') window._updateStickyBar();
}

if (deltaResetBtn) deltaResetBtn.addEventListener('click', resetDeltaFilter);

if (deltaApplyBtn) {
  deltaApplyBtn.addEventListener('click', function() {
    var minVal = deltaMin ? deltaMin.value.trim() : '';
    var maxVal = deltaMax ? deltaMax.value.trim() : '';
    window._deltaFilterActive = true;
    window._deltaFilterState = {
      min:  minVal,
      max:  maxVal,
      dir:  _currentDeltaDir,
      colA: deltaColA ? deltaColA.value : '__myprice',
      colB: deltaColB ? deltaColB.value : '__best'
    };
    deltaFilterBtn.classList.add('active-warn');
    if (typeof renderTable === 'function') renderTable();
    if (typeof window._updateStickyBar === 'function') window._updateStickyBar();
    if (typeof showToast === 'function') showToast('Δ-фильтр применён', 'ok');
  });
}

// Включить кнопку дельты вместе с остальными фильтрами
var _origUpdateUI = window.updateUI;
window.updateUI = function() {
  if (typeof _origUpdateUI === 'function') _origUpdateUI.apply(this, arguments);
  var hasData = (typeof groupedData !== 'undefined' && groupedData.length > 0);
  if (deltaFilterBtn) deltaFilterBtn.disabled = !hasData;
};


// ── DELTA COLUMN HIGHLIGHT via dynamic <style> ──
window._deltaHighlightCols = function() {
  var styleEl = document.getElementById('_deltaColStyle');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = '_deltaColStyle';
    document.head.appendChild(styleEl);
  }

  // Always clear FIRST (globally) before adding anything new
  styleEl.textContent = '';
  document.querySelectorAll('#mainTable th').forEach(function(th) {
    th.classList.remove('delta-col-a', 'delta-col-b');
  });

  if (!window._deltaFilterActive) return;

  var st = window._deltaFilterState;
  var thead = document.querySelector('#mainTable thead tr');
  if (!thead) return;

  var ths = Array.from(thead.children);
  var idxA = -1, idxB = -1;

  var myPriceIndices = [];

  if (st.colA !== '__myprice') {
    ths.forEach(function(th, i) { if (th.dataset.colKey === st.colA) idxA = i + 1; });
  } else {
    ths.forEach(function(th, i) {
      if (th.classList.contains('col-my-price')) {
        th.classList.add('delta-col-a');
        myPriceIndices.push(i + 1);
      }
    });
  }

  if (st.colB !== '__best') {
    ths.forEach(function(th, i) { if (th.dataset.colKey === st.colB) idxB = i + 1; });
  }

  if (idxA > 0) ths[idxA - 1].classList.add('delta-col-a');
  if (idxB > 0) ths[idxB - 1].classList.add('delta-col-b');

  // Inject td styles via nth-child
  var rules = '';
  if (idxA > 0) {
    rules += '#mainTable tbody tr td:nth-child(' + idxA + '){background:#F3F4F6 !important;}';
    rules += '#mainTable tbody tr:hover td:nth-child(' + idxA + '){background:#E5E7EB !important;}';
  }
  myPriceIndices.forEach(function(idx) {
    rules += '#mainTable tbody tr td:nth-child(' + idx + '){background:#F3F4F6 !important;}';
    rules += '#mainTable tbody tr:hover td:nth-child(' + idx + '){background:#E5E7EB !important;}';
  });
  if (idxB > 0) {
    rules += '#mainTable tbody tr td:nth-child(' + idxB + '){background:#F3F4F6 !important;}';
    rules += '#mainTable tbody tr:hover td:nth-child(' + idxB + '){background:#E5E7EB !important;}';
  }
  styleEl.textContent = rules;
};


// Вспомогательная функция: получить минимальную числовую цену из Map-записей по ключу
window._deltaGetPrice = function(item, colKey) {
  if (!item.values) return null;
  var arr = item.values.get ? item.values.get(colKey) : item.values[colKey];
  if (!arr || !arr.length) return null;
  var nums = arr.map(function(v) {
    var n = parseFloat(String(v.val || '').replace(/[^0-9.,]/g,'').replace(',','.'));
    return isNaN(n) ? null : n;
  }).filter(function(n) { return n !== null && n > 0; });
  return nums.length ? Math.min.apply(null, nums) : null;
};

window._deltaApplyToData = function(data) {
  if (!window._deltaFilterActive) return data;
  var st = window._deltaFilterState;
  var minPct = st.min !== '' ? parseFloat(st.min) : null;
  var maxPct = st.max !== '' ? parseFloat(st.max) : null;

  return data.filter(function(item) {
    // Цена A
    var priceA = null;
    if (st.colA === '__myprice') {
      // Ищем колонки «Мой прайс» — используем allColumns если доступен
      if (typeof allColumns !== 'undefined') {
        var myCols = allColumns.filter(function(c) {
          return !c.metaType && c.fileName === (typeof MY_PRICE_FILE_NAME !== 'undefined' ? MY_PRICE_FILE_NAME : 'Мой прайс');
        });
        var myPrices = [];
        myCols.forEach(function(c) {
          var p = window._deltaGetPrice(item, c.key);
          if (p !== null) myPrices.push(p);
        });
        priceA = myPrices.length ? Math.min.apply(null, myPrices) : null;
      }
    } else {
      priceA = window._deltaGetPrice(item, st.colA);
    }
    if (priceA == null || priceA <= 0) return false;

    // Цена B
    var priceB = null;
    if (st.colB === '__best') {
      if (typeof allColumns !== 'undefined') {
        var supCols = allColumns.filter(function(c) {
          return !c.metaType && c.fileName !== (typeof MY_PRICE_FILE_NAME !== 'undefined' ? MY_PRICE_FILE_NAME : 'Мой прайс');
        });
        var supPrices = [];
        supCols.forEach(function(c) {
          var p = window._deltaGetPrice(item, c.key);
          if (p !== null) supPrices.push(p);
        });
        priceB = supPrices.length ? Math.min.apply(null, supPrices) : null;
      }
    } else {
      priceB = window._deltaGetPrice(item, st.colB);
    }
    if (priceB == null || priceB <= 0) return false;

    // Дельта: (B - A) / A * 100
    // cheaper: поставщик (B) дешевле моей цены (A) → delta < 0
    // pricier: поставщик (B) дороже → delta > 0
    var delta = (priceB - priceA) / priceA * 100;
    var absDelta = Math.abs(delta);

    if (st.dir === 'cheaper' && delta >= 0) return false;
    if (st.dir === 'pricier' && delta <= 0) return false;

    // Процент задан — проверяем диапазон. Если не задан — только направление.
    if (minPct !== null && absDelta < minPct) return false;
    if (maxPct !== null && absDelta > maxPct) return false;

    return true;
  });
};

/* ════════════════════════════════════════════════════
   3. MATCHER HISTORY (последние 10 действий с undo)
   ════════════════════════════════════════════════════ */
var _matchHistory = []; // {type:'ok'|'skip', pair, undoData, bc1, bc2, name1, name2}
var MAX_HIST = 10;

var matcherHistoryWrap   = document.getElementById('matcherHistoryWrap');
var matcherHistoryBody   = document.getElementById('matcherHistoryBody');
var matcherHistoryToggle = document.getElementById('matcherHistoryToggle');
var mhistCountEl         = document.getElementById('mhistCount');

if (matcherHistoryToggle) {
  matcherHistoryToggle.addEventListener('click', function() {
    if (matcherHistoryWrap) matcherHistoryWrap.classList.toggle('open');
  });
}

function _renderMatchHistory() {
  if (!matcherHistoryBody || !matcherHistoryWrap || !mhistCountEl) return;

  mhistCountEl.textContent = _matchHistory.length;

  if (_matchHistory.length === 0) {
    matcherHistoryWrap.classList.remove('has-items', 'open');
    return;
  }
  matcherHistoryWrap.classList.add('has-items');

  matcherHistoryBody.innerHTML = _matchHistory.slice().reverse().map(function(entry, revIdx) {
    var realIdx = _matchHistory.length - 1 - revIdx;
    var isOk = entry.type === 'ok';
    var typeCls = isOk ? 'mhist-type--ok' : 'mhist-type--skip';
    var typeLabel = isOk ? '✓ Добавлено' : '✕ Пропущено';
    var names = (entry.name1 || '') + (entry.name2 ? ' / ' + entry.name2 : '');
    return '<div class="mhist-row">' +
      '<span class="mhist-seq">' + (realIdx + 1) + '</span>' +
      '<span class="mhist-type ' + typeCls + '">' + typeLabel + '</span>' +
      '<div class="mhist-barcodes">' +
        '<div class="mhist-bc">' + _hesc(String(entry.bc1)) + ' ↔ ' + _hesc(String(entry.bc2)) + '</div>' +
        (names ? '<div class="mhist-name">' + _hesc(names) + '</div>' : '') +
      '</div>' +
      (isOk ? '<button class="mhist-undo-btn" data-hist-idx="' + realIdx + '" title="Отменить добавление этой пары">↩ Отменить</button>' : '') +
    '</div>';
  }).join('');

  // Bind undo buttons
  matcherHistoryBody.querySelectorAll('.mhist-undo-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(btn.dataset.histIdx, 10);
      _undoMatchHistoryEntry(idx);
    });
  });
}

function _hesc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _addMatchHistoryEntry(type, pair) {
  var entry = {
    type:  type,
    pair:  pair,
    bc1:   pair.bc1,
    bc2:   pair.bc2,
    name1: pair.name1 || '',
    name2: pair.name2 || ''
  };
  _matchHistory.push(entry);
  if (_matchHistory.length > MAX_HIST) _matchHistory.shift();
  _renderMatchHistory();
}

function _undoMatchHistoryEntry(idx) {
  var entry = _matchHistory[idx];
  if (!entry || entry.type !== 'ok') return;

  // Удаляем связь из jeDB
  var bc1 = String(entry.bc1), bc2 = String(entry.bc2);
  if (typeof jeDB !== 'undefined') {
    // Найти группу, содержащую оба кода
    var groupKey = null;
    for (var k in jeDB) {
      var arr = jeDB[k];
      if (!Array.isArray(arr)) continue;
      var allInGroup = arr.map(function(v) { return String(v); });
      allInGroup.push(String(k));
      if (allInGroup.indexOf(bc1) !== -1 && allInGroup.indexOf(bc2) !== -1) {
        groupKey = k; break;
      }
    }
    if (groupKey !== null) {
      var arr2 = jeDB[groupKey];
      if (Array.isArray(arr2)) {
        // Убираем bc2 (или bc1 если он не ключ) из массива
        var toRemove = (String(groupKey) === bc1) ? bc2 : bc1;
        jeDB[groupKey] = arr2.filter(function(v) { return String(v) !== toRemove; });
        if (jeDB[groupKey].length === 1) {
          // Остался только тег, удаляем группу
          delete jeDB[groupKey];
        }
      }
      // Перерендерить базу кросскодов
      if (typeof jeRenderEditor === 'function') jeRenderEditor(true);
      if (typeof renderTable === 'function') renderTable(true);
      if (typeof updateMatchPairTags === 'function') updateMatchPairTags();
      // Снять зелёную подсветку с этой пары
      if (Array.isArray(_matchActivePairs)) {
        for (var _pi = 0; _pi < _matchActivePairs.length; _pi++) {
          var _pr = _matchActivePairs[_pi];
          if ((String(_pr.bc1) === bc1 && String(_pr.bc2) === bc2) ||
              (String(_pr.bc1) === bc2 && String(_pr.bc2) === bc1)) {
            _pr._confirmed = false; break;
          }
        }
      }
      if (typeof renderMatcherTable === 'function') renderMatcherTable(true);
      if (typeof showToast === 'function') showToast('Связь отменена: ' + bc1 + ' ↔ ' + bc2, 'ok');
    } else {
      if (typeof showToast === 'function') showToast('Связь не найдена в базе — возможно уже удалена', 'warn');
    }
  }

  // Убрать запись из истории
  _matchHistory.splice(idx, 1);
  _renderMatchHistory();
}

// Экспортируем чтобы существующий код мог вызывать при принятии/отклонении пары
window._matchHistoryAdd = _addMatchHistoryEntry;

// Патчим confirmMatchPair/rejectMatchPair через MutationObserver — нет,
// Используем Event-based подход: перехватываем клики на ✓/✗ кнопки в matcherTable
document.addEventListener('click', function(e) {
  var matcherTable = document.getElementById('matcherTable');
  if (!matcherTable) return;

  // Кнопка принять (class m-ibtn, текст ✓ или содержит data-openm атрибут для открытия модала)
  // В коде принятие идёт через openMatchModal -> confirmMatchPair
  // Отклонение — через кнопку ✗ которая вызывает rejectMatchPair/skipMatchPair
  // Перехватим вызовы через обёртку существующих функций после загрузки

}, true);

// После загрузки основного скрипта — оборачиваем функции принятия/отклонения
setTimeout(function() {
  // Wrap confirmMatchPair
  if (typeof window.confirmMatchPair === 'function') {
    var _orig = window.confirmMatchPair;
    window.confirmMatchPair = function(pair) {
      if (pair) window._matchHistoryAdd('ok', pair);
      return _orig.apply(this, arguments);
    };
  }
  // Wrap skipMatchPair / rejectPair
  ['skipMatchPair','rejectMatchPair','dismissMatchPair'].forEach(function(fname) {
    if (typeof window[fname] === 'function') {
      var _orig2 = window[fname];
      window[fname] = function(pair) {
        if (pair) window._matchHistoryAdd('skip', pair);
        return _orig2.apply(this, arguments);
      };
    }
  });
}, 500);

// Также перехватываем через делегирование на кнопки ✓ и ✗ в таблице matcher
// (они рендерятся динамически — ловим через атрибуты)
document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-maccept]');
  if (btn) {
    var pairIdx = parseInt(btn.dataset.maccept, 10);
    if (typeof _matchActivePairs !== 'undefined' && _matchActivePairs[pairIdx]) {
      window._matchHistoryAdd('ok', _matchActivePairs[pairIdx]);
    }
    return;
  }
  var skipBtn = e.target.closest('[data-mskip]');
  if (skipBtn) {
    var pairIdx2 = parseInt(skipBtn.dataset.mskip, 10);
    if (typeof _matchActivePairs !== 'undefined' && _matchActivePairs[pairIdx2]) {
      window._matchHistoryAdd('skip', _matchActivePairs[pairIdx2]);
    }
  }
});

})();



// ===== CART LOGIC =====
(function(){
  var _cartPending = null; // pending item for qty dialog
  // cart structure: { supplierFileName: { items: [{barcode, name, price, qty}] } }
  var cart = {};

  function saveCart() {
    // Bug #7 fix: use localStorage so cart persists across tabs (consistent with orderMode storage)
    try { localStorage.setItem('pm_cart', JSON.stringify(cart)); } catch(e) {}
    _rebuildCartedKeys();
  }
  function loadCart() {
    try {
      var s = localStorage.getItem('pm_cart');
      if (s) { var d = JSON.parse(s); if (d && typeof d === 'object') cart = d; }
    } catch(e) {}
    _rebuildCartedKeys();
    updateCartBadge();
  }
  function _rebuildCartedKeys() {
    var s = new Set();
    Object.values(cart).forEach(function(sup) {
      sup.items.forEach(function(it) {
        if (it.barcode && it.colKey) s.add(it.barcode + '|' + it.colKey + '|' + (it.vIndex || 0));
      });
    });
    window._cartedKeys = s;
  }
  loadCart();

  function getTotalItems() {
    var n = 0;
    Object.values(cart).forEach(function(sup){ n += sup.items.length; });
    return n;
  }
  function updateCartBadge() {
    var badge = document.getElementById('cartBadge');
    if (!badge) return;
    var n = getTotalItems();
    badge.textContent = n;
    badge.classList.toggle('has-items', n > 0);
    // Bug #2 fix: re-evaluate cartBtn disabled state based on item count
    var btn = document.getElementById('cartBtn');
    if (btn) btn.disabled = !window._orderModeState && n === 0;
  }

  // ---- order mode ----
  var orderMode = false;
  window._orderModeState = false;
  try { orderMode = localStorage.getItem('pm_orderMode') === '1'; } catch(e) {}

  function _applyOrderModeUI(on) {
    document.body.classList.toggle('order-mode', on);
    window._orderModeState = on;
    var toggleWrap = document.getElementById('orderModeBtn');
    if (toggleWrap) {
      toggleWrap.classList.toggle('toggle-on', on);
      toggleWrap.setAttribute('data-tip', on
        ? 'Режим заказа включён — кликните на цену товара, чтобы выбрать поставщика и добавить позицию в корзину'
        : 'Режим заказа выключен — кликните на любую цену, чтобы скопировать штрихкод этого товара от данного поставщика');
    }
    var btn = document.getElementById('cartBtn');
    // Bug #2 fix: cart button is accessible whenever there are items in the cart,
    // regardless of orderMode. orderMode only controls price-click behavior.
    if (btn) btn.disabled = !on && getTotalItems() === 0;
  }
  window.setOrderMode = function(val) {
    orderMode = !!val;
    try { localStorage.setItem('pm_orderMode', orderMode ? '1' : '0'); } catch(e) {}
    _applyOrderModeUI(orderMode);
  };
  document.addEventListener('DOMContentLoaded', function() {
    _applyOrderModeUI(orderMode);
  });
  _applyOrderModeUI(orderMode);

  // ---- pack size detection ----
  function _detectPackSize(item, colFileName) {
    // Priority 1: packQty from My Price match (most reliable)
    if (item.packQty && item.packQty > 1 && item.packQty <= 200) {
      return { confidence: 'exact', qty: item.packQty, candidates: [item.packQty], source: 'myprice' };
    }

    // Parse a single name string -> [{n, w}] sorted by weight desc
    // Returns ALL plausible candidates with confidence weights
    function _parsePackFromName(name) {
      if (!name) return [];
      var s = String(name).toLowerCase();
      var scores = {}; // n -> max weight

      function add(raw, w) {
        var n = parseInt(raw, 10);
        if (isNaN(n) || n < 2 || n > 500) return;
        if (!scores[n] || scores[n] < w) scores[n] = w;
      }

      // Исключаем паллетные числа: "пал.117", "в пал. 36"
      var excluded = {};
      var pe = /(?:в\s+)?пал(?:лет(?:е|а)?|ет(?:е|а)?)?\.?\s*(\d+)/g, pm;
      while ((pm = pe.exec(s)) !== null) excluded[parseInt(pm[1], 10)] = 1;

      function addSafe(raw, w) { var n = parseInt(raw, 10); if (!excluded[n]) add(raw, w); }

      var m;
      // Вес 100 — явная метка "шт": самый надёжный признак
      m = s.match(/\((\d+)\s*шт/);
      if (m) addSafe(m[1], 100);
      var re1 = /(\d+)\s*шт\.?(?:[\s,;)\/# ]|$)/g;
      while ((m = re1.exec(s)) !== null) addSafe(m[1], 100);

      // Вес 90 — "уп", "блок", "бл"
      m = s.match(/уп(?:ак)?\.?\s*(\d+)/);   if (m) addSafe(m[1], 90);
      m = s.match(/блок\s*(\d+)/);            if (m) addSafe(m[1], 90);
      m = s.match(/бл\.?\s*(\d+)/);           if (m) addSafe(m[1], 85);

      // Вес 80 — дробь "1/N"
      m = s.match(/1\/(\d+)/);                if (m) addSafe(m[1], 80);

      // Вес 65-78 — мультипликативный формат "1х100х20", "АхВхС"
      // Извлекаем ВСЕ числа из цепочки, пропускаем ведущую "1"
      var xchain = /(?:^|[\s(,])(\d+)\s*[xх]\s*(\d+)(?:\s*[xх]\s*(\d+))?/gi;
      while ((m = xchain.exec(s)) !== null) {
        var p1 = parseInt(m[1]), p2 = parseInt(m[2]), p3 = m[3] ? parseInt(m[3]) : null;
        var parts = p3 !== null ? [p1, p2, p3] : [p1, p2];
        var len = parts.length;
        parts.forEach(function(v, i) {
          if (v === 1) return; // ведущая "1x" — пропускаем
          // В цепочке из 3: C (последний) → 78, B (средний) → 72, A (первый) → 65
          var w = len === 3 ? [65, 72, 78][i] : (i === len - 1 ? 75 : 65);
          addSafe(v, w);
        });
      }
      // Одиночный "xN" (не попавший в xchain)
      var xsingle = /[xх]\s*(\d+)(?:[\s,;)\/# ]|$)/g;
      while ((m = xsingle.exec(s)) !== null) addSafe(m[1], 70);

      // Вес 50 — голое число в скобках "(48)" — умеренная уверенность
      var parPat = /\((\d+)\)/g;
      while ((m = parPat.exec(s)) !== null) addSafe(m[1], 50);

      // Вес 45 — "/N" (последний вариант)
      var slashPat = /\/(\d+)(?:[\s,;)\/# ]|$)/g;
      while ((m = slashPat.exec(s)) !== null) addSafe(m[1], 45);

      return Object.keys(scores)
        .map(function(k) { return { n: parseInt(k, 10), w: scores[k] }; })
        .sort(function(a, b) { return b.w - a.w || a.n - b.n; });
    }

    // Агрегируем взвешенные кандидаты со всех вариантов названий
    // Текущий поставщик получает множитель x2
    var aggScores = {};
    if (item.names) {
      item.names.forEach(function(nm) {
        var boost = (nm.fileName === colFileName) ? 2.0 : 1.0;
        _parsePackFromName(nm.name).forEach(function(c) {
          aggScores[c.n] = (aggScores[c.n] || 0) + c.w * boost;
        });
      });
    }

    var ranked = Object.keys(aggScores)
      .map(function(k) { return { n: parseInt(k, 10), s: aggScores[k] }; })
      .sort(function(a, b) { return b.s - a.s || a.n - b.n; });

    if (ranked.length === 0) return { confidence: 'none', qty: 1, candidates: [], source: 'none' };

    var topN = ranked[0].n;
    var candidates = ranked.map(function(r) { return r.n; });
    // "exact" только если единственный кандидат, иначе "ambiguous" -> UI покажет все варианты
    var conf = candidates.length === 1 ? 'exact' : 'ambiguous';
    return { confidence: conf, qty: topN, candidates: candidates, source: 'name' };
  }

  // ---- qty modal shared helpers ----
  function _cqUpdatePill(val, fromManual) {
    var df = (_cartPending && _cartPending.divFactor > 1) ? _cartPending.divFactor : 1;
    var pill = document.getElementById('cqSelectedPill');
    if (!pill) return;
    if (df > 1 && !fromManual) {
      var bl = val / df;
      var blText = Number.isInteger(bl) ? bl + ' бл.' : ('~' + bl.toFixed(1) + ' бл.');
      pill.textContent = val + ' шт. · ' + blText;
      pill.style.background = Number.isInteger(bl) ? '' : '#FEF3C7';
      pill.style.color = Number.isInteger(bl) ? '' : '#92400E';
    } else if (df > 1 && fromManual) {
      pill.textContent = val + ' шт. (как есть)';
      pill.style.background = '#EFF6FF';
      pill.style.color = '#1E40AF';
    } else {
      pill.textContent = val + ' шт.';
      pill.style.background = '';
      pill.style.color = '';
    }
  }

  function _cqSelectChip(val, fromManual) {
    var inp = document.getElementById('cartQtyInput');
    var manualInp = document.getElementById('cqManualInput');
    var chipsEl = document.getElementById('cqChips');
    if (inp) inp.value = val;
    if (manualInp) manualInp.value = val;
    if (_cartPending) _cartPending._manualInput = !!fromManual;
    _cqUpdatePill(val, fromManual);
    if (chipsEl) chipsEl.querySelectorAll('.cq-chip').forEach(function(c) {
      c.classList.toggle('selected', !fromManual && parseInt(c.dataset.val, 10) === val);
    });
  }

  function _cqRebuildChips(df) {
    var chipsEl = document.getElementById('cqChips');
    var divHint = document.getElementById('cqDivHint');
    var manualHint = document.getElementById('cqManualHint');
    if (!chipsEl) return;
    chipsEl.innerHTML = '';
    chipsEl.classList.remove('cq-chips--block');

    var manualTip = document.getElementById('cqManualTip');
    if (df > 1) {
      if (manualTip) manualTip.style.display = 'block';
      // Update block hint
      if (divHint) {
        divHint.style.display = 'flex';
        var src = _cartPending ? _cartPending._packSource : '';
        var cands = (_cartPending && _cartPending._packCandidates) ? _cartPending._packCandidates : [];
        var srcHtml = src === 'myprice' ? ' <span class="cq-block-src">из прайса</span>'
                    : src === 'name'    ? ' <span class="cq-block-src">из названия</span>' : '';
        var otherCands = cands.filter(function(c){ return c !== df; });
        var otherHtml = (otherCands.length > 0 && src !== 'myprice')
          ? ' <span class="cq-block-src" style="opacity:0.65">также: ' + otherCands.join(', ') + ' шт.</span>' : '';
        divHint.innerHTML = 'Блок: <b>' + df + ' шт.</b>' + srcHtml + otherHtml;
      }
      if (manualHint) manualHint.textContent = 'шт. (блоки: ' + df + ' шт.)';
      chipsEl.classList.add('cq-chips--block');
      for (var n = 1; n <= 200; n++) {
        var v = n * df;
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'cq-chip cq-chip-block';
        chip.dataset.val = v;
        chip.innerHTML = '<span class="chip-units">' + v + '</span><span class="chip-blocks">' + n + ' бл.</span>';
        chip.onclick = (function(val){ return function(){ _cqSelectChip(val); }; })(v);
        chipsEl.appendChild(chip);
      }
    } else {
      if (manualTip) manualTip.style.display = 'none';
      if (divHint) divHint.style.display = 'none';
      if (manualHint) manualHint.textContent = 'шт.';
      for (var i = 1; i <= 1000; i++) {
        var chip2 = document.createElement('button');
        chip2.type = 'button';
        chip2.className = 'cq-chip';
        chip2.dataset.val = i;
        chip2.textContent = i;
        chip2.onclick = (function(val){ return function(){ _cqSelectChip(val); }; })(i);
        chipsEl.appendChild(chip2);
      }
    }
  }

  // Called when user manually picks a pack size from the ambiguous selector
  window.cqSelectPack = function(qty) {
    if (!_cartPending) return;
    qty = parseInt(qty, 10) || 1;
    _cartPending.divFactor = qty;
    // Highlight active button
    var packSelEl = document.getElementById('cqPackSelect');
    if (packSelEl) {
      packSelEl.querySelectorAll('.cqs-btn').forEach(function(b) {
        b.classList.toggle('active', parseInt(b.dataset.qty, 10) === qty);
      });
    }
    // Rebuild chip grid keeping current qty
    var curQty = parseInt((document.getElementById('cartQtyInput') || {}).value, 10) || 1;
    _cqRebuildChips(qty);
    // Restore current qty (do not reset it)
    _cqSelectChip(curQty);
    // Update divHint text
    var divHint = document.getElementById('cqDivHint');
    if (divHint && qty > 1) {
      var src = _cartPending._packSource || '';
      var srcHtml = src === 'myprice' ? ' <span class="cq-block-src">из прайса</span>'
                  : src === 'name'    ? ' <span class="cq-block-src">из названия</span>' : '';
      divHint.innerHTML = 'Блок: <b>' + qty + ' шт.</b>' + srcHtml;
      divHint.style.display = 'flex';
    } else if (divHint) {
      divHint.style.display = 'none';
    }
    setTimeout(function() {
      var chips = document.getElementById('cqChips');
      if (chips) { var sel = chips.querySelector('.cq-chip.selected'); if (sel) { var cw = chips.parentElement; if (cw) { var relTop = sel.offsetTop - cw.scrollTop; var relBot = relTop + sel.offsetHeight - cw.clientHeight; if (relTop < 0) cw.scrollTop += relTop - 4; else if (relBot > 0) cw.scrollTop += relBot + 4; } } }
    }, 20);
  };

  // ---- qty modal helpers ----
  window.cqManualChange = function() {
    var manualInp2 = document.getElementById('cqManualInput');
    var val = parseInt(manualInp2.value, 10);
    if (isNaN(val) || val < 1) return;
    _cqSelectChip(val, true);
  };

  window.cqManualStep = function(dir) {
    var df = (_cartPending && _cartPending.divFactor > 1) ? _cartPending.divFactor : 1;
    var isManualMode = _cartPending && !!_cartPending._manualInput;
    // In manual mode always step by 1; in block mode step by block size
    var step = (df > 1 && !isManualMode) ? df : 1;
    var inp2 = document.getElementById('cartQtyInput');
    var cur = parseInt((inp2 ? inp2.value : '1'), 10) || 1;
    var next = Math.max(1, cur + dir * step);
    _cqSelectChip(next, isManualMode);
  };

  // ---- price click handler ----
  window.priceClick = function(supplierBarcode, colKey, priceDisplay, mainBarcode, divFactor, cellMin, cellMax, hasDivBtn, vIndex) {
    try {
    if (!orderMode) {
      // original behavior: copy barcode
      if (navigator.clipboard) navigator.clipboard.writeText(String(supplierBarcode)).catch(function(){});
      return;
    }
    vIndex = (vIndex !== undefined && vIndex !== null) ? parseInt(vIndex, 10) : 0;
    // Save scroll position NOW — before the modal overlay covers the table.
    // Reading scrollTop after the modal is open can return 0 in some browsers.
    var _tableScrollTop = 0;
    try { var _tw0 = document.getElementById('mainTableWrap'); if (_tw0) _tableScrollTop = _tw0.scrollTop; } catch(e) {}
    divFactor = (divFactor && divFactor > 1) ? parseInt(divFactor, 10) : 1;
    var originalDivFactor = divFactor; // сохраняем ДО детекции — нужно для предупреждения
    cellMin = parseFloat(cellMin) || 0;
    cellMax = parseFloat(cellMax) || 0;
    // order mode: open qty dialog
    var col = null;
    if (typeof allColumns !== 'undefined') col = allColumns.find(function(c){ return c.key === colKey; });
    var supplierName = col ? (col.displayName || col.fileName || colKey) : colKey;
    // get item name + detect pack size for items without explicit divFactor
    var itemName = '';
    var _detectedPack = { confidence: 'none', qty: 1, candidates: [], source: 'none' };
    if (typeof _vsData !== 'undefined') {
      var row = _vsData.find(function(r){ return r.barcode === mainBarcode || r.barcode === supplierBarcode; });
      if (row && row.names && row.names.length > 0) {
        var n = col ? row.names.find(function(x){ return x.fileName === col.fileName; }) : null;
        itemName = (n || row.names[0]).name || '';
      }
      // If no explicit divFactor from cell, try to detect pack size
      if (divFactor <= 1 && row) {
        _detectedPack = _detectPackSize(row, col ? col.fileName : null);
        if (_detectedPack.confidence !== 'none') {
          divFactor = _detectedPack.qty;
        }
      } else if (divFactor > 1) {
        // divFactor came from auto-division — mark as exact from price
        _detectedPack = { confidence: 'exact', qty: divFactor, candidates: [divFactor], source: 'myprice' };
      }
    }
    _cartPending = { supplierBarcode: supplierBarcode, colKey: colKey, vIndex: vIndex, priceDisplay: priceDisplay,
      mainBarcode: mainBarcode, supplierName: supplierName, itemName: itemName, divFactor: divFactor,
      _packSource: _detectedPack.source, _packConfidence: _detectedPack.confidence,
      _packCandidates: _detectedPack.candidates || [],
      _scrollTop: _tableScrollTop };
    // check if already in cart -> pre-fill qty (show in units, i.e. blocks * factor)
    var existQty = 0;
    if (cart[supplierName]) {
      // Fix: match by barcode AND colKey — same product can have multiple price columns
      var ex = cart[supplierName].items.find(function(i){ return i.barcode === supplierBarcode && i.colKey === colKey && (i.vIndex || 0) === vIndex; });
      if (ex) {
        // Fix: use the STORED divFactor of the existing item, not the freshly detected one.
        // If the item was added with manual input (storedDivFactor=undefined), exDf=1 and
        // existQty = ex.qty (raw units). Using the newly re-detected divFactor here would
        // multiply raw units by block size again, showing e.g. 500 instead of 50.
        var exDf = (ex.divFactor && ex.divFactor > 1) ? ex.divFactor : 1;
        existQty = ex.qty * exDf;
      }
    }
    document.getElementById('cqSupplier').textContent = supplierName;
    document.getElementById('cqName').textContent = itemName || supplierBarcode;
    document.getElementById('cqBarcode').textContent = 'Штрихкод: ' + supplierBarcode;
    document.getElementById('cqPrice').textContent = 'Цена: ' + priceDisplay + ' / шт.';
    // price warning if multi-price cell
    var priceWarn = document.getElementById('cqPriceWarn');
    var clickedNum = parseFloat(String(priceDisplay).replace(/[^0-9.,]/g,'').replace(',','.'));
    if (priceWarn) {
      priceWarn.style.display = 'none';
      priceWarn.textContent = '';
      var _dec = (typeof PRICE_DECIMALS !== 'undefined') ? PRICE_DECIMALS : 1;
      var clickedRounded = parseFloat(clickedNum.toFixed(_dec));
      var cellMinRounded = parseFloat(cellMin.toFixed(_dec));
      var cellMaxRounded = parseFloat(cellMax.toFixed(_dec));
      var cellMinDisplay = cellMin.toFixed(_dec).replace(/\.0+$/, '');
      if (cellMinRounded > 0 && cellMaxRounded > 0 && cellMinRounded !== cellMaxRounded) {
        if (clickedRounded > cellMinRounded) {
          priceWarn.style.display = 'block';
          priceWarn.style.background = '#FEF2F2';
          priceWarn.style.borderColor = '#FECACA';
          priceWarn.style.color = '#991B1B';
          priceWarn.textContent = '⚠ У этого поставщика есть цена ниже: ' + cellMinDisplay;
        } else if (clickedRounded === cellMinRounded && (cellMaxRounded - cellMinRounded) / cellMaxRounded > 0.1) {
          priceWarn.style.display = 'block';
          priceWarn.style.background = '#FFFBEB';
          priceWarn.style.borderColor = '#FDE68A';
          priceWarn.style.color = '#92400E';
          priceWarn.textContent = '⚠ Цена на ' + Math.round((cellMaxRounded - cellMinRounded) / cellMaxRounded * 100) + '% ниже другой цены поставщика — возможно товар с истекающим сроком годности.';
        }
      }
    }
    // Предупреждение: цена похоже за блок, но деление не применено
    var divNeededEl = document.getElementById('cqDivNeeded');
    if (divNeededEl) {
      // Показываем если: не было явного divFactor из ячейки, но детектор нашёл кандидатов из названия
      var needsWarn = (originalDivFactor <= 1)
                   && _detectedPack.candidates && _detectedPack.candidates.length > 0
                   && _detectedPack.source === 'name'
                   && !!hasDivBtn;
      divNeededEl.style.display = needsWarn ? 'block' : 'none';
    }
    // qty label, hint & populate chips — use module-level helpers
    // (cqManualChange and cqManualStep defined at module level above priceClick)

    // Показываем селектор размера блока всегда, когда есть кандидаты
    // (не только при ambiguous) — предлагаем все варианты, не утверждаем
    var packSelEl = document.getElementById('cqPackSelect');
    var cqsButtons = document.getElementById('cqsButtons');
    if (packSelEl && cqsButtons) {
      var hasCandidates = _detectedPack.candidates && _detectedPack.candidates.length > 0
                          && _detectedPack.source !== 'myprice';
      if (hasCandidates) {
        cqsButtons.innerHTML = '';
        _detectedPack.candidates.forEach(function(cand) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'cqs-btn' + (cand === divFactor ? ' active' : '');
          b.dataset.qty = cand;
          b.textContent = cand + '\u00a0шт.';
          b.onclick = (function(q){ return function(){ window.cqSelectPack(q); }; })(cand);
          cqsButtons.appendChild(b);
        });
        // кнопка отказа от блочного режима
        var bNone = document.createElement('button');
        bNone.type = 'button';
        bNone.className = 'cqs-btn cqs-btn--none' + (divFactor <= 1 ? ' active' : '');
        bNone.dataset.qty = 1;
        bNone.textContent = 'штучно';
        bNone.onclick = function(){ window.cqSelectPack(1); };
        cqsButtons.appendChild(bNone);
        packSelEl.style.display = 'flex';
      } else {
        packSelEl.style.display = 'none';
      }
    }

    // Build chip grid
    _cqRebuildChips(divFactor);

    // pre-select
    var preVal = (divFactor > 1) ? (existQty > 0 ? existQty : divFactor) : (existQty > 0 ? existQty : 1);
    _cqSelectChip(preVal);
    // scroll selected chip into view & focus manual input
    setTimeout(function(){
      var chipsEl2 = document.getElementById('cqChips');
      if (chipsEl2) { var selChip = chipsEl2.querySelector('.cq-chip.selected'); if (selChip) { var cw2 = chipsEl2.parentElement; if (cw2) { var rTop = selChip.offsetTop - cw2.scrollTop; var rBot = rTop + selChip.offsetHeight - cw2.clientHeight; if (rTop < 0) cw2.scrollTop += rTop - 4; else if (rBot > 0) cw2.scrollTop += rBot + 4; } } }
      var mi = document.getElementById('cqManualInput');
      if (mi) { mi.focus({ preventScroll: true }); mi.select(); }
    }, 40);
    document.getElementById('cartQtyModal').classList.add('open');
    } catch(e) { window._logErr(e, 'priceClick'); if(typeof showToast==='function') showToast('Ошибка корзины — см. журнал ⚠️', 'err'); }
  };

  window.closeCartQtyModal = function() {
    document.getElementById('cartQtyModal').classList.remove('open');
    _cartPending = null;
  };
  function _doAddToCart(qtyInput) {
    try {
    var p = _cartPending;
    if (!p) return; // safety guard — should not happen but prevents silent freeze
    var divFactor = p.divFactor || 1;
    var isManual = !!p._manualInput;
    var qtyToStore, storedDivFactor;
    if (isManual || divFactor <= 1) {
      qtyToStore = qtyInput;        // штуки напрямую
      storedDivFactor = undefined;  // no block tracking
    } else {
      qtyToStore = Math.round(qtyInput / divFactor); // в блоках
      storedDivFactor = divFactor;
    }
    if (!cart[p.supplierName]) cart[p.supplierName] = { items: [] };
    // Fix: match by BOTH barcode and colKey so the same product with two price columns
    // (e.g. нал/безнал) creates two independent cart lines instead of overwriting each other.
    var ex = cart[p.supplierName].items.find(function(i){ return i.barcode === p.supplierBarcode && i.colKey === p.colKey && (i.vIndex || 0) === (p.vIndex || 0); });
    if (ex) {
      ex.qty = qtyToStore;
      ex.price = p.priceDisplay;
      ex.divFactor = storedDivFactor;
      ex.mainBarcode = p.mainBarcode || p.supplierBarcode;
    } else {
      cart[p.supplierName].items.push({ barcode: p.supplierBarcode, mainBarcode: p.mainBarcode || p.supplierBarcode, name: p.itemName, price: p.priceDisplay, colKey: p.colKey, vIndex: p.vIndex || 0, qty: qtyToStore, divFactor: storedDivFactor });
    }
    // Restore scroll to position captured at modal-open time (before the overlay appeared).
    // Reading scrollTop while modal is open can return 0 in some browsers.
    var _tw = document.getElementById('mainTableWrap');
    var _savedScroll = (p._scrollTop != null) ? p._scrollTop : (_tw ? _tw.scrollTop : 0);
    saveCart();
    updateCartBadge();
    closeCartQtyModal();
    if (typeof _mvsRenderVisible === 'function') {
      // Set scrollTop BEFORE rendering so virtual scroll computes the correct
      // visible window (MVS.start/end). Without this it reads 0 after modal close
      // and only renders the top rows, causing a visible flash before rAF restores.
      if (_tw && _savedScroll > 0) { _tw.scrollTop = _savedScroll; }
      _mvsRenderVisible();
      // One rAF to let the browser settle after innerHTML reflow, then lock scroll again
      if (_tw && _savedScroll > 0) {
        requestAnimationFrame(function() { _tw.scrollTop = _savedScroll; });
      }
    }
    var toastMsg = '✅ Добавлено: ' + (p.itemName || p.supplierBarcode);
    if (!isManual && storedDivFactor > 1) {
      toastMsg += ' — ' + qtyToStore + ' бл. (' + (qtyToStore * storedDivFactor) + ' шт.)';
    } else {
      toastMsg += ' — ' + qtyToStore + ' шт.';
    }
    if (typeof showToast === 'function') showToast(toastMsg, 'ok');
    } catch(e) { window._logErr(e, '_doAddToCart'); if(typeof showToast==='function') showToast('Ошибка добавления в корзину — см. журнал ⚠️', 'err'); }
  }

  window.confirmCartQty = function() {
    if (!_cartPending) { closeCartQtyModal(); return; }
    var qtyInput = parseInt(document.getElementById('cartQtyInput').value, 10);
    if (isNaN(qtyInput) || qtyInput < 1) qtyInput = 1;
    _doAddToCart(qtyInput);
  };


  // ---- cart modal ----
  window.openCartModal = function() {
    // Don't open an empty cart — nothing useful to show
    if (!Object.keys(cart).length || !Object.values(cart).some(function(s){ return s.items.length; })) {
      if (typeof showToast === 'function') showToast('Корзина пуста', 'warn');
      return;
    }
    renderCartModal();
    // show "свой прайс" button only if my price is loaded
    var hasMyPrice = !!(window._pmApp && window._pmApp.myPriceData);
    var btn = document.getElementById('cartMyPriceBtn');
    var cancelBtn = document.getElementById('cartMyPriceCancelBtn');
    if (btn) btn.style.display = hasMyPrice ? '' : 'none';
    // show cancel button only if any items already have my price applied
    var hasApplied = hasMyPrice && Object.values(cart).some(function(sup){ return sup.items.some(function(it){ return it._myName; }); });
    if (cancelBtn) cancelBtn.style.display = hasApplied ? '' : 'none';
    document.getElementById('cartModal').classList.add('open');
  };
  window.closeCartModal = function() {
    document.getElementById('cartModal').classList.remove('open');
  };

  function getSupplierTotal(items) {
    var total = 0;
    items.forEach(function(it) {
      var p = parseFloat(String(it.price).replace(/[^0-9.,]/g,'').replace(',','.'));
      var df = it.divFactor && it.divFactor > 1 ? it.divFactor : 1;
      if (!isNaN(p)) total += p * it.qty * df;
    });
    return total;
  }

  function getGrandTotal() {
    var t = 0;
    Object.values(cart).forEach(function(sup){ t += getSupplierTotal(sup.items); });
    return t;
  }

  function renderCartModal() {
    var body = document.getElementById('cartModalBody');
    if (!body) return;
    var suppliers = Object.keys(cart);
    if (!suppliers.length) {
      body.innerHTML = '<div class="cart-empty-msg">Корзина пуста. Включите режим <b>«Формирование заказа»</b> и кликайте по ценам.</div>';
      var _ft = document.getElementById('cartModalFooter'); if (_ft) _ft.style.display = 'none';
      return;
    }
    var html = '';
    suppliers.forEach(function(supName) {
      var sup = cart[supName];
      if (!sup.items.length) return;
      var total = getSupplierTotal(sup.items);
      var hasMarkup = sup.items.some(function(it){ return it.myPrice != null; });
      var hasMyPriceReplace = sup.items.some(function(it){ return it._myName; });
      var unmarkedCount = sup.items.filter(function(it){ return it.myPrice == null; }).length;
      var markedCount   = sup.items.length - unmarkedCount;
      var selectedCount = sup.items.filter(function(it){ return it._checked; }).length;
      var supAttr = _esc(supName);

      html += '<div class="cart-supplier-block" data-sup="' + supAttr + '">';
      html += '<div class="cart-supplier-header">';
      html += '<span>📦 ' + supAttr + '</span>';
      html += '<span class="cart-supplier-total">Итого: ' + total.toFixed(2) + '</span>';
      html += '</div>';

      // toolbar
      html += '<div class="cart-markup-bar">';
      html += '<span class="cart-markup-bar-label">Наценка:</span>';
      html += '<select class="cart-markup-select">';
      for (var pct = 1; pct <= 100; pct++) html += '<option value="' + pct + '"' + (pct===10?' selected':'') + '>' + pct + '%</option>';
      html += '</select>';
      html += '<button class="cart-markup-apply" onclick="applyMarkupFromBtn(this)"' + (unmarkedCount===0?' disabled title="Все позиции уже имеют наценку"':'') + '>% Применить</button>';
      if (markedCount > 0) {
        html += '<button class="cart-markup-cancel" onclick="cancelMarkupFromBtn(this)">✕ Отменить наценку</button>';
      }
      html += '<span class="cart-markup-info">' + (selectedCount > 0 ? 'выбрано: ' + selectedCount + ' из ' + sup.items.length : '') + '</span>';
      html += '</div>';

      // table
      html += '<div class="cart-table-wrap"><table class="cart-items-table"><thead><tr>';
      html += '<th class="col-cb"><input type="checkbox" class="cart-cb" title="Выбрать все / снять все" onchange="cartSelectAllFromCb(this)" ' + (selectedCount===sup.items.length&&sup.items.length>0?'checked':'') + '></th>';
      if (hasMyPriceReplace) {
        html += '<th>Штрихкод поставщика</th><th style="color:var(--green-dark);">🏷️ Мой штрихкод</th>';
        html += '<th>Наименование поставщика</th><th style="color:var(--green-dark);">🏷️ Моё наименование</th>';
      } else {
        html += '<th>Штрихкод</th><th>Наименование</th>';
      }
      // Bug #4 fix: show unit hint in qty column header when any item has divFactor
      var _hasBlocks = sup.items.some(function(it){ return it.divFactor && it.divFactor > 1; });
      html += '<th class="num">Цена / шт.</th><th class="num">Кол-во' + (_hasBlocks ? ' <span style="font-weight:400;font-size:9px;color:var(--amber-dark);">(бл.)</span>' : '') + '</th><th class="num">Сумма</th>';
      if (hasMarkup) html += '<th class="col-myprice num">Моя цена</th>';
      html += '<th style="width:32px;"></th></tr></thead><tbody>';

      // sort items by common words, then alphabetically
      var _sortedItems = _sortCartItems(sup.items);
      _sortedItems.forEach(function(it) {
        var idx = sup.items.indexOf(it);
        var p = parseFloat(String(it.price).replace(/[^0-9.,]/g,'').replace(',','.'));
        var df = it.divFactor && it.divFactor > 1 ? it.divFactor : 1;
        var sum = isNaN(p) ? '' : (p * it.qty * df).toFixed(2);
        var rowClass = it.myPrice != null ? ' class="cart-row-marked"' : '';
        var qtyWidget = '<input class="cart-qty-inp" type="number" min="1" value="' + it.qty + '"'
          + ' data-sup="' + _esc(supName) + '"'
          + ' data-idx="' + idx + '"'
          + ' data-price="' + (isNaN(p)?'':p) + '"'
          + ' data-divfactor="' + df + '"'
          + ' onchange="cartQtyCommit(this)" onblur="cartQtyCommit(this)" onkeydown="if(event.key===\'Enter\')this.blur()">';
        var qtyCell = '<td class="cart-qty-cell">' + qtyWidget
          + (df > 1 ? '<span class="cart-block-hint">&times;&nbsp;' + df + '&nbsp;=&nbsp;<b class="cart-block-units">' + (it.qty*df) + '&nbsp;шт.</b></span>' : '')
          + '</td>';
        var rowMyCls = it._myName ? ' class="cart-row-myprice"' : (rowClass ? rowClass : '');
        if (it._myName && rowClass) rowMyCls = ' class="cart-row-myprice cart-row-marked"';
        html += '<tr' + (it._myName ? rowMyCls : rowClass) + '>';
        html += '<td class="col-cb"><input type="checkbox" class="cart-cb" data-sup="' + _esc(supName) + '" data-idx="' + idx + '" onchange="cartToggleCheck(this)"' + (it._checked?' checked':'') + '></td>';
        if (hasMyPriceReplace) {
          html += '<td style="font-family:\'Inter\',monospace;font-size:11px;color:var(--text-muted);">' + _esc(it.barcode) + '</td>';
          html += '<td style="font-family:\'Inter\',monospace;font-size:11px;color:var(--green-dark);">' + (it._myBarcode ? _esc(it._myBarcode) : '<span style="color:var(--text-muted)">—</span>') + '</td>';
          html += '<td class="name-cell" style="color:var(--text-muted);">' + _esc(it.name || '') + '</td>';
          html += '<td class="name-cell" style="color:var(--green-dark);">' + (it._myName ? _esc(it._myName) : '<span style="color:var(--text-muted)">—</span>') + '</td>';
        } else {
          html += '<td style="font-family:\'Inter\',monospace;font-size:11px;">' + _esc(it.barcode) + '</td>';
          html += '<td class="name-cell">' + _esc(it.name || '') + '</td>';
        }
        html += '<td class="cart-price-cell">' + _esc(String(it.price)) + (df > 1 ? '<span class="cart-div-badge" title="Цена за штуку, блок ÷' + df + '">÷' + df + '</span>' : '') + '</td>';
        html += qtyCell;
        html += '<td class="cart-sum-cell">' + sum + '</td>';
        if (hasMarkup) {
          if (it.myPrice != null) {
            html += '<td class="cart-myprice-cell">' + it.myPrice.toFixed(2) + '<span class="cart-myprice-badge">+' + it._markup + '%</span></td>';
          } else {
            html += '<td style="color:var(--text-muted);font-size:11px;text-align:right;">—</td>';
          }
        }
        html += '<td><button class="cart-del-btn" onclick=\'removeCartItem(' + JSON.stringify(supName) + ',' + idx + ')\' title="Удалить">✕</button></td>';
        html += '</tr>';
      });

      // total row — colspan depends on columns
      // Columns: cb(1) + barcode(1or2) + name(1or2) + price(1) + qty(1) = 5 base
      // hasMyPriceReplace adds 2 (extra barcode + extra name cols)
      // hasMarkup adds 1 col but it has its own empty <td>, so NOT counted in colspan
      var extraCols = (hasMyPriceReplace ? 2 : 0);
      var totalColspan = 5 + extraCols; // Bug #1 fix: hasMarkup excluded from colspan
      html += '<tr class="cart-total-row">';
      html += '<td colspan="' + totalColspan + '" class="total-label">Итого по поставщику:</td>';
      html += '<td class="total-val">' + total.toFixed(2) + '</td>';
      if (hasMarkup) html += '<td></td>';
      html += '<td></td></tr>';
      html += '</tbody></table></div></div>';
    });

    body.innerHTML = html;
    // grand total in sticky footer outside scroll area
    _updateCartFooter();
  }

  function _updateCartFooter() {
    var footer = document.getElementById('cartModalFooter');
    if (!footer) return;
    var suppliers = Object.keys(cart);
    var hasItems = suppliers.some(function(k){ return cart[k].items.length; });
    if (!hasItems) { footer.style.display = 'none'; return; }
    var grandTotal = getGrandTotal();
    var supCount = suppliers.filter(function(k){ return cart[k].items.length; }).length;
    footer.style.display = 'block';
    footer.innerHTML = '<div class="cart-grand-total">Итого по всем поставщикам (' + supCount + '): <span class="cart-grand-val" id="cartGrandVal">' + grandTotal.toFixed(2) + '</span></div>';
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _sortCartItems(items) {
    if (!items || items.length < 2) return items.slice();
    // collect all words from all item names
    var wordCount = {};
    var stopWords = {'и':1,'в':1,'с':1,'на':1,'по':1,'для':1,'из':1,'от':1,'за':1,'а':1,'но':1};
    items.forEach(function(it) {
      var words = String(it.name || '').toLowerCase().replace(/[^а-яёa-z0-9\s]/gi,'').split(/\s+/);
      var seen = {};
      words.forEach(function(w) {
        if (w.length >= 3 && !stopWords[w] && !seen[w]) {
          seen[w] = 1;
          wordCount[w] = (wordCount[w] || 0) + 1;
        }
      });
    });
    // keep only words that appear in 2+ items
    var groupWords = Object.keys(wordCount).filter(function(w){ return wordCount[w] >= 2; });
    // sort groupWords by frequency desc, then length desc (more specific first)
    groupWords.sort(function(a,b){ return wordCount[b] - wordCount[a] || b.length - a.length; });
    // assign each item to first matching group
    function getGroup(it) {
      var name = String(it.name || '').toLowerCase();
      for (var i = 0; i < groupWords.length; i++) {
        if (name.indexOf(groupWords[i]) !== -1) return i;
      }
      return groupWords.length; // ungrouped
    }
    return items.slice().sort(function(a, b) {
      var ga = getGroup(a), gb = getGroup(b);
      if (ga !== gb) return ga - gb;
      return String(a.name||'').localeCompare(String(b.name||''), 'ru');
    });
  }

  // ---- checkbox helpers ----
  window.cartToggleCheck = function(cb) {
    var supName = cb.getAttribute('data-sup');
    var idx = parseInt(cb.getAttribute('data-idx'), 10);
    if (cart[supName] && cart[supName].items[idx]) {
      cart[supName].items[idx]._checked = cb.checked;
    }
    _updateMarkupInfo(supName);
  };
  function _updateMarkupInfo(supName) {
    if (!cart[supName]) return;
    var sup = cart[supName];
    var allBlocks = document.querySelectorAll('.cart-supplier-block');
    var block = null;
    for (var bi = 0; bi < allBlocks.length; bi++) {
      if (allBlocks[bi].getAttribute('data-sup') === supName) { block = allBlocks[bi]; break; }
    }
    var el = block ? block.querySelector('.cart-markup-info') : null;
    if (!el) return;
    var selectedCount = sup.items.filter(function(it){ return it._checked; }).length;
    el.textContent = selectedCount > 0 ? 'выбрано: ' + selectedCount + ' из ' + sup.items.length : 'к необработанным без наценки';
  }


  function _getSupNameFromEl(el) {
    var block = el.closest('.cart-supplier-block');
    return block ? block.getAttribute('data-sup') : null;
  }

  window.applyMarkupFromBtn = function(btn) {
    var supName = _getSupNameFromEl(btn);
    if (!supName || !cart[supName]) return;
    var sup = cart[supName];
    var block = btn.closest('.cart-supplier-block');
    var sel = block ? block.querySelector('.cart-markup-select') : null;
    if (!sel) return;
    var pct = parseInt(sel.value, 10);
    if (isNaN(pct) || pct < 1 || pct > 100) return;
    var hasChecked = sup.items.some(function(it){ return it._checked; });
    if (!hasChecked) {
      if (typeof showToast === 'function') showToast('Выберите товары чекбоксами для применения наценки', 'warn');
      return;
    }
    var applied = 0;
    sup.items.forEach(function(it) {
      if (it.myPrice != null) return;
      if (!it._checked) return;
      var base = parseFloat(String(it.price).replace(/[^0-9.,]/g,'').replace(',','.'));
      if (isNaN(base)) return;
      it.myPrice = Math.round(base * (1 + pct / 100) * 100) / 100;
      it._markup = pct;
      applied++;
    });
    if (applied === 0) {
      if (typeof showToast === 'function') showToast('Нет позиций для наценки (уже обработаны или не выбраны)', 'warn');
      return;
    }
    // uncheck all
    sup.items.forEach(function(it){ it._checked = false; });
    saveCart();
    renderCartModal();
    if (typeof showToast === 'function') showToast('✅ Наценка ' + pct + '% применена к ' + applied + ' позиц.', 'ok');
  };

  window.cancelMarkupFromBtn = function(btn) {
    var supName = _getSupNameFromEl(btn);
    if (!supName || !cart[supName]) return;
    var sup = cart[supName];
    var hasChecked = sup.items.some(function(it){ return it._checked; });
    // Bug #3 fix: when no checkboxes selected this would wipe ALL markups silently — require confirm
    if (!hasChecked) {
      var markedTotal = sup.items.filter(function(it){ return it.myPrice != null; }).length;
      if (markedTotal === 0) return;
      if (!confirm('Снять наценку со всех ' + markedTotal + ' позиций поставщика?')) return;
    }
    var cancelled = 0;
    sup.items.forEach(function(it) {
      if (it.myPrice == null) return;
      if (hasChecked && !it._checked) return;
      it.myPrice = undefined;
      it._markup = undefined;
      cancelled++;
    });
    if (cancelled === 0) return;
    saveCart();
    renderCartModal();
    if (typeof showToast === 'function') showToast('↩ Наценка отменена у ' + cancelled + ' позиц.', 'ok');
  };

  window.cartSelectAllFromCb = function(cb) {
    var supName = _getSupNameFromEl(cb);
    if (!supName || !cart[supName]) return;
    cart[supName].items.forEach(function(it){ it._checked = cb.checked; });
    // update row checkboxes and info without full re-render
    var block = cb.closest('.cart-supplier-block');
    if (block) {
      block.querySelectorAll('tbody .cart-cb').forEach(function(c){ c.checked = cb.checked; });
      var info = block.querySelector('.cart-markup-info');
      if (info) {
        var n = cb.checked ? cart[supName].items.length : 0;
        info.textContent = n > 0 ? 'выбрано: ' + n + ' из ' + cart[supName].items.length : 'к необработанным без наценки';
      }
    }
  };

  window.cartQtyCommit = function(inp) {
    var qty = parseInt(inp.value, 10);
    if (isNaN(qty) || qty < 1) { qty = 1; inp.value = 1; }
    var supName = inp.getAttribute('data-sup');
    var idx = parseInt(inp.getAttribute('data-idx'), 10);
    var price = parseFloat(inp.getAttribute('data-price'));
    var df = parseInt(inp.getAttribute('data-divfactor'), 10) || 1;
    if (!cart[supName] || !cart[supName].items[idx]) return;
    if (cart[supName].items[idx].qty === qty) return; // no change
    cart[supName].items[idx].qty = qty;
    saveCart();
    updateCartBadge();
    var tr = inp.closest('tr');
    if (tr) {
      var unitsEl = tr.querySelector('.cart-block-units');
      if (unitsEl) unitsEl.textContent = (qty * df) + '\u00a0шт.';
      var sumCell = tr.querySelector('.cart-sum-cell');
      if (sumCell) sumCell.textContent = isNaN(price) ? '' : (price * qty * df).toFixed(2);
      // Bug #5 fix: refresh myPrice cell (price-per-unit stays the same, but re-render keeps it consistent)
      var myPriceCell = tr.querySelector('.cart-myprice-cell');
      if (myPriceCell && cart[supName] && cart[supName].items[idx]) {
        var _itmp = cart[supName].items[idx];
        if (_itmp.myPrice != null) {
          myPriceCell.innerHTML = _itmp.myPrice.toFixed(2) + '<span class="cart-myprice-badge">+' + _itmp._markup + '%</span>';
        }
      }
    }
    var block = inp.closest('.cart-supplier-block');
    if (block) {
      var newTotal = getSupplierTotal(cart[supName].items);
      var hdr = block.querySelector('.cart-supplier-total');
      if (hdr) hdr.textContent = 'Итого: ' + newTotal.toFixed(2);
    }
    var grandEl = document.getElementById('cartGrandVal');
    if (grandEl) grandEl.textContent = getGrandTotal().toFixed(2);
    else _updateCartFooter();
  };

  window.removeCartItem = function(supName, idx) {
    if (cart[supName]) {
      cart[supName].items.splice(idx, 1);
      if (!cart[supName].items.length) delete cart[supName];
      saveCart();
      updateCartBadge();
      // If cart is now empty — close modal instead of showing empty message
      if (!Object.keys(cart).length) {
        closeCartModal();
        if (typeof showToast === 'function') showToast('Корзина очищена', 'ok');
      } else {
        renderCartModal();
      }
      if (typeof _mvsRenderVisible === 'function') _mvsRenderVisible();
    }
  };
  // ---- apply / cancel my price substitution ----
  window.applyMyPriceToCart = function() {
    if (!window._pmApp || !window._pmApp.myPriceData) {
      if (typeof showToast === 'function') showToast('Мой прайс не загружен', 'warn');
      return;
    }
    var mpFileName = typeof window._pmMyPriceName === 'function' ? window._pmMyPriceName() : 'Мой прайс';
    var applied = 0, total = 0;
    Object.values(cart).forEach(function(sup) {
      sup.items.forEach(function(it) {
        total++;
        if (it._myName) return; // already applied
        var lookupBc = it.mainBarcode || it.barcode;
        var row = typeof window._pmLookupBarcode === 'function' ? window._pmLookupBarcode(lookupBc) : null;
        if (!row && lookupBc !== it.barcode) {
          row = typeof window._pmLookupBarcode === 'function' ? window._pmLookupBarcode(it.barcode) : null;
        }
        if (!row) return;
        // check if row has myPrice name
        var myName = (row.namesByFile && row.namesByFile.get(mpFileName)) || null;
        if (!myName) return;
        it._myName = myName;
        it._myBarcode = row.barcode; // canonical barcode = barcode from my price (loaded first)
        applied++;
      });
    });
    if (applied === 0) {
      if (typeof showToast === 'function') showToast('Нет совпадений с вашим прайс-листом', 'warn');
      return;
    }
    saveCart();
    renderCartModal();
    // update button visibility
    var cancelBtn = document.getElementById('cartMyPriceCancelBtn');
    if (cancelBtn) cancelBtn.style.display = '';
    if (typeof showToast === 'function') showToast('✅ Подставлено из вашего прайса: ' + applied + ' из ' + total, 'ok');
  };

  window.cancelMyPriceFromCart = function() {
    Object.values(cart).forEach(function(sup) {
      sup.items.forEach(function(it) {
        delete it._myName;
        delete it._myBarcode;
      });
    });
    saveCart();
    renderCartModal();
    var cancelBtn = document.getElementById('cartMyPriceCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (typeof showToast === 'function') showToast('↩ Замена на мой прайс отменена', 'ok');
  };

  window.clearCart = function(silent) {
    if (!Object.keys(cart).length) return;
    function _doClear() {
      cart = {};
      saveCart();
      updateCartBadge();
      closeCartModal();
      if (typeof _mvsRenderVisible === 'function') _mvsRenderVisible();
    }
    if (silent) { _doClear(); return; }
    jeConfirmDialog('Очистить всю корзину?', '🗑 Очистка корзины').then(function(ok) {
      if (!ok) return;
      _doClear();
    });
  };

  // ---- Excel export: shared workbook builder ----
  // Single source of truth for both downloadCartExcel and _cartGetExcelBlob.
  // Always 2 columns (barcode + name). If "Мой прайс" substitution is active for an item,
  // its barcode and name are replaced with values from my price list; otherwise supplier data is used.
  function _buildCartWorkbook() {
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Price Manager';
    var ws = wb.addWorksheet('Корзина');
    var suppliers = Object.keys(cart);
    var row = 1;

    // Единая палитра: тонкие чёрные внутри, жирные чёрные снаружи/шапка/поставщик/итого
    var T = { style:'thin',   color:{argb:'FF000000'} };
    var B = { style:'medium', color:{argb:'FF000000'} };
    var fntBase = { size:10 };
    var fntBold = { size:10, bold:true };

    // Ширины колонок
    ws.getColumn(1).width = 22;  // штрихкод
    ws.getColumn(2).width = 50;  // наименование
    ws.getColumn(3).width = 14;  // цена/шт.
    ws.getColumn(4).width = 18;  // кол-во
    ws.getColumn(5).width = 14;  // сумма
    ws.getColumn(6).width = 14;  // моя цена

    suppliers.forEach(function(supName) {
      var sup = cart[supName];
      if (!sup.items.length) return;

      var total = getSupplierTotal(sup.items);
      var supHasMarkup = sup.items.some(function(it){ return it.myPrice != null; });

      var headers = ['Штрихкод', 'Наименование', 'Цена / шт.', 'Кол-во', 'Сумма'];
      if (supHasMarkup) headers.push('Моя цена');
      var lastCol = headers.length;

      // ---- Строка поставщика (заголовок блока) ----
      var supRow = ws.getRow(row);
      supRow.getCell(1).value = supName;
      for (var c = 1; c <= lastCol; c++) {
        supRow.getCell(c).font      = fntBold;
        supRow.getCell(c).alignment = { vertical:'middle', horizontal:'left' };
        supRow.getCell(c).border    = {
          top:    B, bottom: B,
          left:   c === 1       ? B : T,
          right:  c === lastCol ? B : T
        };
      }
      ws.mergeCells(row, 1, row, lastCol);
      supRow.height = 18;
      row++;

      // ---- Шапка колонок ----
      var hRow = ws.getRow(row);
      headers.forEach(function(h, i) {
        var hc = hRow.getCell(i + 1);
        hc.value     = h;
        hc.font      = fntBold;
        hc.alignment = { vertical:'middle', horizontal: i >= 2 ? 'right' : 'left' };
        hc.border    = {
          top:    B, bottom: B,
          left:   i === 0         ? B : T,
          right:  i === lastCol-1 ? B : T
        };
      });
      hRow.height = 16;
      row++;

      // ---- Строки товаров ----
      var items = sup.items;
      items.forEach(function(it, itIdx) {
        var p       = parseFloat(String(it.price).replace(/[^0-9.,]/g,'').replace(',','.'));
        var df      = it.divFactor && it.divFactor > 1 ? it.divFactor : 1;
        var realQty = it.qty * df;
        var sum     = isNaN(p) ? '' : parseFloat((p * realQty).toFixed(2));
        var isLastItem = itIdx === items.length - 1;
        var iRow    = ws.getRow(row);

        iRow.getCell(1).value = it._myBarcode ? it._myBarcode : it.barcode;
        iRow.getCell(2).value = it._myName    ? it._myName    : (it.name || '');
        iRow.getCell(3).value = isNaN(p) ? it.price : p;
        if (!isNaN(p)) iRow.getCell(3).numFmt = '#,##0.00';
        iRow.getCell(4).value = df > 1 ? (it.qty + ' бл. (' + realQty + ' шт.)') : it.qty;
        iRow.getCell(5).value = sum;
        if (typeof sum === 'number') iRow.getCell(5).numFmt = '#,##0.00';
        if (supHasMarkup) {
          iRow.getCell(6).value  = it.myPrice != null ? it.myPrice : '';
          iRow.getCell(6).numFmt = '#,##0.00';
        }

        for (var ci = 1; ci <= lastCol; ci++) {
          var cell2 = iRow.getCell(ci);
          cell2.font      = fntBase;
          cell2.alignment = { vertical:'middle', horizontal: ci >= 3 ? 'right' : 'left' };
          cell2.border    = {
            top:    itIdx === 0 ? B : T,        // первый товар — жирная граница от шапки
            bottom: isLastItem  ? B : T,        // последний товар — жирная граница к итого
            left:   ci === 1       ? B : T,
            right:  ci === lastCol ? B : T
          };
        }
        iRow.height = 16;
        row++;
      });

      // ---- Итого ----
      var tRow = ws.getRow(row);
      tRow.getCell(4).value     = 'Итого:';
      tRow.getCell(5).value     = parseFloat(total.toFixed(2));
      tRow.getCell(5).numFmt    = '#,##0.00';
      for (var tc = 1; tc <= lastCol; tc++) {
        tRow.getCell(tc).font      = fntBold;
        tRow.getCell(tc).alignment = { vertical:'middle', horizontal: tc >= 3 ? 'right' : 'left' };
        tRow.getCell(tc).border    = {
          top:    B, bottom: B,
          left:   tc === 1       ? B : T,
          right:  tc === lastCol ? B : T
        };
      }
      tRow.height = 16;
      row += 2; // пустая строка-разделитель между поставщиками
    });

    return wb;
  }

  // ---- Excel download ----
  window.downloadCartExcel = function() {
    if (!Object.keys(cart).length) { if (typeof showToast === 'function') showToast('Корзина пуста', 'warn'); return; }
    if (typeof ExcelJS === 'undefined') { if (typeof showToast === 'function') showToast('ExcelJS не загружен', 'err'); return; }
    var wb = _buildCartWorkbook();
    wb.xlsx.writeBuffer().then(function(buf) {
      var blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var now = new Date();
      var stamp = now.getFullYear() + '_' + String(now.getMonth()+1).padStart(2,'0') + '_' + String(now.getDate()).padStart(2,'0');
      saveAs(blob, 'cart_' + stamp + '.xlsx');
      if (typeof showToast === 'function') showToast('\u2705 Корзина скачана', 'ok');
    }).catch(function(e) {
      if (typeof showToast === 'function') showToast('Ошибка экспорта: ' + e, 'err');
    });
  };

  // ---- expose for archive integration ----
  window._cartGetExcelBlob = function() {
    if (!Object.keys(cart).length || typeof ExcelJS === 'undefined') return Promise.resolve(null);
    var wb = _buildCartWorkbook();
    return wb.xlsx.writeBuffer().then(function(buf) {
      return new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    });
  };

    window._cartHasItems = function(){ return Object.keys(cart).length > 0; };

// close on overlay click (handled via inline onclick on the elements)

// ═══ HELP MODAL ═══
(function() {
  var TITLES = {
    prepare:    '📂 Загрузка прайсов — инструкция',
    monitor:    '📊 Мониторинг цен — инструкция',
    matcher:    '🔍 Поиск кросскодов — инструкция',
    barcodes:   '🔢 База штрихкодов — инструкция',
    brands:     '🏷️ База брендов — инструкция'
  };

  window.openHelpModal = function(pane) {
    var modal  = document.getElementById('helpModal');
    var body   = document.getElementById('helpModalBody');
    var title  = document.getElementById('helpModalTitle');
    if (!modal || !body || !title) return;

    var sourceEl = null;
    var titleKey = pane;

    if (pane === 'prepare') {
      var adv  = document.getElementById('obrAdvantagesBlock');
      var hint = document.getElementById('obrUploadHint');
      body.innerHTML = '';
      if (adv)  body.appendChild(adv.cloneNode(true));
      if (hint) body.appendChild(hint.cloneNode(true));
    } else if (pane === 'monitor') {
      // monitorEmptyState is destroyed when data loads — use saved copy
      var liveEl = document.getElementById('monitorEmptyState');
      if (liveEl) {
        sourceEl = liveEl;
      } else if (_monitorInstrHTML) {
        body.innerHTML = _monitorInstrHTML;
        title.textContent = TITLES['monitor'];
        modal.classList.add('open');
        document.documentElement.style.overflow = 'hidden';
        return;
      } else {
        body.innerHTML = '<p style="color:var(--text-muted);padding:20px;">Инструкция недоступна — загрузите данные, чтобы увидеть справку.</p>';
        title.textContent = TITLES['monitor'];
        modal.classList.add('open');
        document.documentElement.style.overflow = 'hidden';
        return;
      }
    } else if (pane === 'matcher') {
      sourceEl = document.getElementById('matcherEmpty');
    } else if (pane === 'jsoneditor') {
      var bcTab = document.getElementById('subtab-barcodes');
      var isBarcodes = bcTab && bcTab.classList.contains('active');
      titleKey  = isBarcodes ? 'barcodes' : 'brands';
      sourceEl  = isBarcodes
        ? document.getElementById('jeEmpty')
        : document.getElementById('brandEmpty');
    }

    if (pane !== 'prepare') {
      body.innerHTML = sourceEl ? sourceEl.innerHTML : '<p style="color:var(--text-muted);padding:20px;">Инструкция недоступна.</p>';
    }

    title.textContent = TITLES[titleKey] || 'Инструкция';
    modal.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
  };

  window.closeHelpModal = function() {
    var modal = document.getElementById('helpModal');
    if (modal) modal.classList.remove('open');
    document.documentElement.style.overflow = '';
  };

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var modal = document.getElementById('helpModal');
      if (modal && modal.classList.contains('open')) closeHelpModal();
    }
  });
})();

})();


