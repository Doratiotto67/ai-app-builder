import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'webcontainer-cache';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

interface CacheEntry {
    projectId: string;
    packageJsonHash: string;
    cachedAt: number;
    fileTree: Record<string, string>;
    installedPackages: string[];
}

/**
 * Gerenciador de cache persistente para WebContainer
 * Usa IndexedDB para armazenar metadata de projetos entre sessões
 */
export class WebContainerCacheManager {
    private db: IDBPDatabase | null = null;

    async init() {
        if (this.db) return;

        this.db = await openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
                    store.createIndex('cachedAt', 'cachedAt');
                }
            },
        });

        console.log('[CacheManager] IndexedDB inicializado');
    }

    async save(entry: CacheEntry): Promise<void> {
        try {
            if (!this.db) await this.init();
            await this.db!.put(STORE_NAME, entry);
            console.log(`[CacheManager] Cache salvo: ${entry.projectId}`);
        } catch (error) {
            console.error('[CacheManager] Erro ao salvar cache:', error);
        }
    }

    async get(projectId: string): Promise<CacheEntry | undefined> {
        try {
            if (!this.db) await this.init();
            const entry = await this.db!.get(STORE_NAME, projectId);

            if (entry) {
                console.log(`[CacheManager] Cache encontrado: ${projectId} (${new Date(entry.cachedAt).toLocaleString()})`);
            } else {
                console.log(`[CacheManager] Cache não encontrado: ${projectId}`);
            }

            return entry;
        } catch (error) {
            console.error('[CacheManager] Erro ao buscar cache:', error);
            return undefined;
        }
    }

    async delete(projectId: string): Promise<void> {
        try {
            if (!this.db) await this.init();
            await this.db!.delete(STORE_NAME, projectId);
            console.log(`[CacheManager] Cache removido: ${projectId}`);
        } catch (error) {
            console.error('[CacheManager] Erro ao deletar cache:', error);
        }
    }

    async clear(): Promise<void> {
        try {
            if (!this.db) await this.init();
            await this.db!.clear(STORE_NAME);
            console.log('[CacheManager] Todos os caches removidos');
        } catch (error) {
            console.error('[CacheManager] Erro ao limpar caches:', error);
        }
    }

    /**
     * Remove caches antigos (>7 dias)
     */
    async cleanOldCaches(): Promise<void> {
        try {
            if (!this.db) await this.init();

            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const index = tx.store.index('cachedAt');

            let cursor = await index.openCursor();
            let deleted = 0;

            while (cursor) {
                if (cursor.value.cachedAt < sevenDaysAgo) {
                    await cursor.delete();
                    deleted++;
                }
                cursor = await cursor.continue();
            }

            if (deleted > 0) {
                console.log(`[CacheManager] ${deleted} cache(s) antigo(s) removido(s)`);
            }
        } catch (error) {
            console.error('[CacheManager] Erro ao limpar caches antigos:', error);
        }
    }

    /**
     * Gera hash SHA-256 do package.json
     */
    async hashPackageJson(packageJson: string): Promise<string> {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(packageJson);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            console.error('[CacheManager] Erro ao gerar hash:', error);
            return '';
        }
    }

    /**
     * Obter estatísticas do cache
     */
    async getStats(): Promise<{ totalProjects: number; totalSize: number; oldestCache?: Date }> {
        try {
            if (!this.db) await this.init();

            const allEntries = await this.db!.getAll(STORE_NAME);
            const totalProjects = allEntries.length;

            let oldestTimestamp = Date.now();
            for (const entry of allEntries) {
                if (entry.cachedAt < oldestTimestamp) {
                    oldestTimestamp = entry.cachedAt;
                }
            }

            return {
                totalProjects,
                totalSize: allEntries.reduce((sum, e) => sum + JSON.stringify(e).length, 0),
                oldestCache: totalProjects > 0 ? new Date(oldestTimestamp) : undefined,
            };
        } catch (error) {
            console.error('[CacheManager] Erro ao obter estatísticas:', error);
            return { totalProjects: 0, totalSize: 0 };
        }
    }
}

// Singleton instance
export const cacheManager = new WebContainerCacheManager();

// Limpar caches antigos na inicialização (não-bloqueante)
if (typeof window !== 'undefined') {
    cacheManager.cleanOldCaches().catch(console.error);
}
