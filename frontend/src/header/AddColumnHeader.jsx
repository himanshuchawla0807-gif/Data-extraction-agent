import PlusIcon from '../img/Plus';
import React from 'react';
import { ActionTypes, Constants } from '../utils';

export default function AddColumnHeader({ getHeaderProps, dataDispatch }) {
  const { key, ...headerProps } = getHeaderProps();
  return (
    <div key={key} {...headerProps} className="th noselect add-column-header">
      <div
        className="th-content"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
        onClick={e =>
          dataDispatch({
            type: ActionTypes.ADD_COLUMN_TO_LEFT,
            columnId: Constants.ADD_COLUMN_ID,
            focus: true,
          })
        }
      >
        <span className="svg-icon svg-gray">
          <PlusIcon />
        </span>
      </div>
    </div>
  );
}
