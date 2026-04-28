import React from 'react';
import { ActionTypes, DataTypes, shortId } from '../utils';
import DataTypeIcon from './DataTypeIcon';

function getLabel(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function TypesMenu({
  popper,
  popperRef,
  dataDispatch,
  setShowTypeMenu,
  onClose,
  columnId,
  onMouseEnter,
  onMouseLeave,
}) {
  const types = [
    {
      type: DataTypes.TEXT,
      onClick: e => {
        dataDispatch({
          type: ActionTypes.UPDATE_COLUMN_TYPE,
          columnId,
          dataType: DataTypes.TEXT,
        });
        onClose();
      },
      icon: <DataTypeIcon dataType={DataTypes.TEXT} />,
      label: getLabel(DataTypes.TEXT),
    },
    {
      type: DataTypes.SELECT,
      onClick: e => {
        dataDispatch({
          type: ActionTypes.UPDATE_COLUMN_TYPE,
          columnId,
          dataType: DataTypes.SELECT,
        });
        onClose();
      },
      icon: <DataTypeIcon dataType={DataTypes.SELECT} />,
      label: getLabel(DataTypes.SELECT),
    },
    {
      type: DataTypes.NUMBER,
      onClick: e => {
        dataDispatch({
          type: ActionTypes.UPDATE_COLUMN_TYPE,
          columnId,
          dataType: DataTypes.NUMBER,
        });
        onClose();
      },
      icon: <DataTypeIcon dataType={DataTypes.NUMBER} />,
      label: 'Numerical',
    },
    {
      type: DataTypes.FILE,
      onClick: e => {
        dataDispatch({
          type: ActionTypes.UPDATE_COLUMN_TYPE,
          columnId,
          dataType: DataTypes.FILE,
        });
        onClose();
      },
      icon: <DataTypeIcon dataType={DataTypes.FILE} />,
      label: getLabel(DataTypes.FILE),
    },
  ];

  return (
    <div
      className="types-menu-minimalist"
      ref={popperRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...popper.attributes.popper}
      style={{
        ...popper.styles.popper,
        zIndex: 1002,
      }}
    >
      {types.map(type => (
        <button className="types-menu-item" onClick={type.onClick} key={shortId()}>
          <span className="types-menu-icon">{type.icon}</span>
          <span className="types-menu-label">{type.label}</span>
        </button>
      ))}
    </div>
  );
}
