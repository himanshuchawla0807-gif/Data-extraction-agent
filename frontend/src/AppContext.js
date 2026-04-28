import React, { createContext, useContext } from 'react';

export const SourceViewerContext = createContext({
    openSourceViewer: (source, highlightValue) => { },
});

export const useSourceViewer = () => useContext(SourceViewerContext);
