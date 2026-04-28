
const update = require('immutability-helper');

// MOCK LOGGER
const logger = {
    warn: console.warn,
    important: console.log,
    debug: console.log
};

// MOCK CONSTANTS
const ActionTypes = {
    RENAME_COLUMN: 'rename_column',
    UPDATE_CELL: 'update_cell'
};

// REDUCER (Copied from App.jsx fix)
function reducer(state, action) {
    switch (action.type) {
        case ActionTypes.RENAME_COLUMN:
            // ✅ NEW: Rename column in-place (for replace operations)
            // Find the column by ID if provided, otherwise fallback to Label (legacy)
            const renameIndex = state.columns.findIndex(
                column => (action.columnId && column.id === action.columnId) || column.label === action.oldLabel
            );

            if (renameIndex < 0) {
                logger.warn('[RENAME_COLUMN] Column not found:', action.columnId || action.oldLabel);
                return state;
            }

            logger.important(`[RENAME] Renaming column idx ${renameIndex}: ${state.columns[renameIndex].label} -> ${action.newLabel}`);

            // Create new columns array with renamed column
            const renamedColumns = state.columns.map((col, idx) => {
                if (idx === renameIndex) {
                    return {
                        ...col,
                        label: action.newLabel,
                    };
                }
                return col;
            });

            // ❌ FIX: DO NOT CLEAR DATA on rename. (Preserved)
            return update(state, {
                skipReset: { $set: true },
                columns: { $set: renamedColumns },
            });

        case ActionTypes.UPDATE_CELL:
            // Simple update logic for test
            if (!state.data[action.rowIndex]) return state;
            return update(state, {
                skipReset: { $set: true },
                data: {
                    [action.rowIndex]: { [action.columnId]: { $set: action.value } },
                },
            });

        default:
            return state;
    }
}

// TEST EXECUTION
function runTest() {
    console.log('🧪 Starting Reducer Test...');

    // 1. Setup Initial State
    const initialColumns = [
        { id: 'doc_name', label: 'Document Name' },
        { id: 'col_1', label: 'Column 1' }, // The generic column
        { id: 'col_2', label: 'Column 2' }
    ];
    const initialData = [
        { 'doc_name': 'File A', 'col_1': 'Extracting...', 'col_2': null }
    ];

    let state = {
        columns: initialColumns,
        data: initialData,
        skipReset: false
    };

    console.log('Initial State:', JSON.stringify(state, null, 2));

    // 2. Simulate Stream Data Arriving (Update Cell)
    console.log('\n🌊 Step 1: Stream Data Updates Cell (Before Rename)');
    state = reducer(state, {
        type: ActionTypes.UPDATE_CELL,
        rowIndex: 0,
        columnId: 'col_1',
        value: '10 Million'
    });
    console.log('State after Update:', JSON.stringify(state.data[0], null, 2));

    if (state.data[0]['col_1'] !== '10 Million') {
        console.error('❌ FAIL: Data update failed');
        return;
    }

    // 3. Simulate Rename (using ID - My Robust Fix)
    console.log('\n✏️ Step 2: Rename Column 1 -> Revenue (Using ID)');
    state = reducer(state, {
        type: ActionTypes.RENAME_COLUMN,
        columnId: 'col_1',
        oldLabel: 'Column 1', // Legacy fallback provided but ignored if ID matches
        newLabel: 'Revenue'
    });

    console.log('State after Rename:', JSON.stringify(state, null, 2));

    // VERIFICATION
    const renamedCol = state.columns.find(c => c.id === 'col_1');
    const cellValue = state.data[0]['col_1'];

    console.log('\n🔍 Verification Results:');
    console.log(`Column Label: '${renamedCol.label}' (Expected: 'Revenue')`);
    console.log(`Cell Value: '${cellValue}' (Expected: '10 Million')`);

    if (renamedCol.label === 'Revenue' && cellValue === '10 Million') {
        console.log('\n✅ PASS: Reducer correctly renamed column AND preserved data.');
    } else {
        console.log('\n❌ FAIL: State mismatch.');
        if (renamedCol.label !== 'Revenue') console.error('  - Label update failed');
        if (cellValue !== '10 Million') console.error('  - Data preservation failed');
    }
}

runTest();
