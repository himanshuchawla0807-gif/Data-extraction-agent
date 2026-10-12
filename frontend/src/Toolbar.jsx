import React, { useState } from 'react';

export default function Toolbar() {
  const [activeTab, setActiveTab] = useState('build');

  return (
    <div className="top-toolbar-minimal">
      <div className="toolbar-tabs-minimal">
        <button
          className={`toolbar-tab-minimal ${activeTab === 'build' ? 'active' : ''}`}
          onClick={() => setActiveTab('build')}
        >
          Build
        </button>
        <button
          className={`toolbar-tab-minimal ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          Review
        </button>
        <button
          className={`toolbar-tab-minimal ${activeTab === 'automate' ? 'active' : ''}`}
          onClick={() => setActiveTab('automate')}
        >
          Automate
        </button>
      </div>
      <div className="toolbar-actions-minimal">
        <button className="toolbar-button-minimal">
          Export
        </button>
        <button className="toolbar-button-minimal primary">
          Share
        </button>
      </div>
    </div>
  );
}
