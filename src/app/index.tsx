import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initI18n } from '@/shared/i18n';
import { STORAGE } from '@/shared/config/storage-keys';

import { App } from './App.js';
import { AppProvider } from './providers';
import './styles/index.css';
import '../entities/index.js';
import '../features/index.js';
import '../widgets/index.js';

initI18n(STORAGE.lang.get());

const savedRoute = STORAGE.lastRoute.get();
const currentHash = window.location.hash.replace(/^#/, '');
if (savedRoute !== '/' && (!currentHash || currentHash === '/')) {
    window.location.hash = savedRoute;
}

const container = document.getElementById('root');
if (!container) throw new Error('root element missing');

createRoot(container).render(
    <StrictMode>
        <AppProvider>
            <App />
        </AppProvider>
    </StrictMode>,
);
