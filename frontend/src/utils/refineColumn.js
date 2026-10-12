/**
 * Pure function to refine a column in the schema.
 * Produces a new columns array immutably.
 *
 * @param {Array} columns - Current array of column definitions
 * @param {String} columnId - ID of the column to refine
 * @param {Object} refineOptions - Options to update { label, dataType, options, etc. }
 * @returns {Array} New columns array
 */
export function refineColumn(columns, columnId, refineOptions) {
    const colIndex = columns.findIndex(c => c.id === columnId);
    if (colIndex === -1) return columns;

    const newColumns = [...columns];
    const oldCol = newColumns[colIndex];

    // Merge updates
    newColumns[colIndex] = {
        ...oldCol,
        ...refineOptions,
        // Ensure we don't accidentally overwrite critical fields if they aren't provided
        id: oldCol.id,
    };

    return newColumns;
}
