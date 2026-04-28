import React from 'react';
import { DataTypes } from '../utils';
import TextIcon from '../img/Text';
import MultiIcon from '../img/Multi';
import HashIcon from '../img/Hash';
import FileIcon from '../img/File';

export default function DataTypeIcon({ dataType }) {
  function getPropertyIcon(dataType) {
    switch (dataType) {
      case DataTypes.NUMBER:
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="9" x2="20" y2="9" />
            <line x1="4" y1="15" x2="20" y2="15" />
            <line x1="10" y1="3" x2="8" y2="21" />
            <line x1="16" y1="3" x2="14" y2="21" />
          </svg>
        );
      case DataTypes.TEXT:
        return <TextIcon />;
      case DataTypes.SELECT:
        return <MultiIcon />;
      case DataTypes.FILE:
        return <FileIcon />;
      default:
        return null;
    }
  }

  return getPropertyIcon(dataType);
}
