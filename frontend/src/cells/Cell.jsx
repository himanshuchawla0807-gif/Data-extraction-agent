import React from 'react';
import { DataTypes } from '../utils';
import TextCell from './TextCell';
import NumberCell from './NumberCell';
import SelectCell from './SelectCell';
import FileCell from './FileCell';

export default function Cell({
  value: initialValue,
  row: { index },
  column: { id, dataType, options, showCitations = true },
  dataDispatch,
  isUpdating, // ✅ Receive isUpdating
}) {
  function getCellElement() {
    switch (dataType) {
      case DataTypes.FILE:
        return (
          <FileCell
            initialValue={initialValue}
            rowIndex={index}
            columnId={id}
          />
        );
      case DataTypes.TEXT:
        return (
          <TextCell
            initialValue={initialValue}
            rowIndex={index}
            columnId={id}
            dataDispatch={dataDispatch}
            showCitations={showCitations}
            isUpdating={isUpdating} // ✅ Pass to TextCell
          />
        );

      case DataTypes.NUMBER:
        return (
          <NumberCell
            initialValue={initialValue}
            rowIndex={index}
            columnId={id}
            dataDispatch={dataDispatch}
            showCitations={showCitations}
            isUpdating={isUpdating} // ✅ Pass to NumberCell
          />
        );
      case DataTypes.SELECT:
        return (
          <SelectCell
            initialValue={initialValue}
            options={options}
            rowIndex={index}
            columnId={id}
            dataDispatch={dataDispatch}
          />
        );
      default:
        return <span></span>;
    }
  }

  return getCellElement();
}
