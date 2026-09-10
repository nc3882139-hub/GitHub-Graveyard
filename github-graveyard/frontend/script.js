const DEMO_ORIGINS = [
    'auth', 'dashboard', 'billing', 'search', 'checkout', 'notifications', 'api', 'user', 'deploy', 'metrics'
];

const DEMO_FILES = [
    'src/auth/login.js',
    'src/api/client.js',
    'src/dashboard/overview.js',
    'src/checkout/review.js',
    'src/search/index.ts',
    'src/notifications/bubble.js',
    'src/lib/cache.js',
    'src/metrics/collector.js'
];

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatRelativeTime(dateString) {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const minutes = Math.max(1, Math.round(diffMs / 60000));
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatTimestamp(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

function buildDemoGraveyard(repoName) {
    const repoLabel = repoName || 'demo/repository';
    const deletions = Array.from({ length: 16 }, (_, index) => {
        const file = DEMO_FILES[index % DEMO_FILES.length];
        const origin = DEMO_ORIGINS[index % DEMO_ORIGINS.length];
        const lines = [
            `const ${origin}Legacy = false;`,
            `return ${origin}Guard ? request : fallback;`,
            `console.warn('deprecated ${origin} path');`,
            `if (!user) { return null; }`,
            `// removed in cleanup ${index + 1}`
        ].slice(0, Math.min(5, 2 + (index % 4))).map((content, lineIndex) => ({
            file,
            content,
            timestamp: new Date(Date.now() - (index + 1) * 1000 * 60 * 18 + lineIndex * 60000).toISOString()
        }));

        return {
            commitId: `demo-${index + 1}`,
            message: `Remove ${origin} path and deprecated fallback (${index + 1})`,
            author: ['Ava', 'Milo', 'Zoe', 'Lena', 'Noah'][index % 5],
            timestamp: new Date(Date.now() - index * 1000 * 60 * 44).toISOString(),
            lines,
            stats: {
                totalDeletions: lines.length,
                filesModified: [file]
            }
        };
    });

    const totalDeletions = deletions.reduce((sum, item) => sum + (item.lines?.length || 0), 0);
    const files = new Set(deletions.flatMap(item => (item.lines || []).map(line => line.file)));

    return {
        repoId: repoLabel,
        demoMode: true,
        deletions,
        stats: {
            totalDeletions,
            totalFiles: Array.from(files),
            lastUpdate: deletions[0]?.timestamp || new Date().toISOString()
        }
    };
}

class GraveyardVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x070b11, 12, 32);

        this.camera = new THREE.PerspectiveCamera(
            52,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.4, 14);

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.container.appendChild(this.renderer.domElement);

        this.ghosts = [];
        this.particles = null;
        this.pointer = new THREE.Vector2(0, 0);
        this.raycaster = new THREE.Raycaster();
        this.interactiveTargets = [];

        this.setupLights();
        this.addParticles();
        this.bindEvents();
        this.animate = this.animate.bind(this);
        this.animate();
    }

    setupLights() {
        const ambient = new THREE.AmbientLight(0xdfeeff, 0.9);
        this.scene.add(ambient);

        const glow = new THREE.PointLight(0x6ef7c7, 3.2, 50);
        glow.position.set(4, 7, 10);
        this.scene.add(glow);

        const violet = new THREE.PointLight(0x8a6fff, 2.5, 45);
        violet.position.set(-7, 2, 9);
        this.scene.add(violet);
    }

    addParticles() {
        const count = 900;
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 34;
            positions[i + 1] = (Math.random() - 0.5) * 18;
            positions[i + 2] = (Math.random() - 0.5) * 24 - 5;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0x79f7c7,
            size: 0.08,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
    }

    makeGhostTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 160;
        const context = canvas.getContext('2d');

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = '700 36px "SFMono-Regular", Consolas, monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.shadowColor = 'rgba(81, 255, 190, 0.75)';
        context.shadowBlur = 18;
        context.fillStyle = 'rgba(120, 255, 200, 0.9)';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    updateFromDeletions(deletions) {
        this.clearGhosts();
        this.interactiveTargets = [];

        if (!deletions || deletions.length === 0) {
            return;
        }

        const recent = deletions.slice(-18).reverse();

        recent.forEach((deletion, index) => {
            const line = deletion.lines && deletion.lines.length ? deletion.lines[0] : null;
            const content = line ? (line.content || '').replace(/\s+/g, ' ').trim() : 'ghost';
            const label = content.slice(0, 18) || 'forgotten';
            const sprite = this.createGhost(label, index, deletion);
            this.ghosts.push(sprite);
            this.scene.add(sprite);
            this.interactiveTargets.push(sprite);
        });
    }

    createGhost(label, index, deletion) {
        const texture = this.makeGhostTexture(label);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const sprite = new THREE.Sprite(material);
        sprite.position.set(
            ((index % 6) - 2.5) * 2.4 + (Math.random() - 0.5) * 1.5,
            (Math.random() - 0.5) * 5.5,
            ((index % 5) - 2) * 2.2 - 2
        );
        sprite.scale.set(4.7, 1.25, 1);
        sprite.userData = { deletion, label };
        return sprite;
    }

    clearGhosts() {
        this.ghosts.forEach(sprite => this.scene.remove(sprite));
        this.ghosts = [];
    }

    bindEvents() {
        window.addEventListener('resize', () => this.onResize());

        const rect = () => this.container.getBoundingClientRect();
        this.renderer.domElement.addEventListener('pointermove', event => {
            const bounds = rect();
            this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
            this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
            this.raycaster.setFromCamera(this.pointer, this.camera);

            const hits = this.raycaster.intersectObjects(this.interactiveTargets, false);
            this.container.style.cursor = hits.length ? 'pointer' : 'grab';
        });

        this.renderer.domElement.addEventListener('click', event => {
            const bounds = rect();
            const pointer = new THREE.Vector2(
                ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
                -((event.clientY - bounds.top) / bounds.height) * 2 + 1
            );

            this.raycaster.setFromCamera(pointer, this.camera);
            const hits = this.raycaster.intersectObjects(this.interactiveTargets, false);
            if (hits.length > 0 && typeof window.openGhostMemory === 'function') {
                window.openGhostMemory(hits[0].object.userData.deletion);
            }
        });
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(this.animate);

        if (this.particles) {
            this.particles.rotation.y += 0.0005;
            this.particles.rotation.x = Math.sin(Date.now() * 0.0002) * 0.35;
        }

        this.ghosts.forEach((sprite, index) => {
            const t = Date.now() * 0.0015 + index;
            sprite.position.y += Math.sin(t) * 0.003;
            sprite.position.x += Math.cos(t * 0.9) * 0.002;
            sprite.material.opacity = 0.45 + Math.sin(Date.now() * 0.003 + index) * 0.25;
        });

        this.camera.position.x += (this.pointer.x * 1.8 - this.camera.position.x) * 0.04;
        this.camera.position.y += (this.pointer.y * 1.2 + 1.5 - this.camera.position.y) * 0.05;
        this.camera.lookAt(0, 0, 0);

        this.renderer.render(this.scene, this.camera);
    }
}

window.GraveyardVisualizer = GraveyardVisualizer;

class GitHubGraveyardApp {
    constructor() {
        this.apiUrl = 'http://localhost:3000/api';
        this.currentRepo = null;
        this.state = {
            deletions: [],
            selected: null,
            filter: 'all',
            search: '',
            demoMode: false
        };

        this.visualizer = new GraveyardVisualizer('three-container');
        this.bindEvents();
        this.renderEmptyMemory();
        this.renderAnalytics();
        this.renderTimeline([]);
        this.renderDeletionList();
    }

    bindEvents() {
        const repoForm = document.getElementById('repoForm');
        const repoInput = document.getElementById('repoInput');

        repoForm.addEventListener('submit', event => {
            event.preventDefault();
            const repo = repoInput.value.trim();
            if (!repo) {
                this.showValidation('Please enter a repository in owner/repo format.', true);
                return;
            }
            this.loadGraveyard(repo);
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            if (this.currentRepo) {
                this.loadGraveyard(this.currentRepo, true);
            }
        });

        document.getElementById('resurrectBtn').addEventListener('click', () => this.resurrectCode());
        document.getElementById('closeModalBtn').addEventListener('click', () => this.hideModal());
        document.getElementById('searchInput').addEventListener('input', event => {
            this.state.search = event.target.value.trim().toLowerCase();
            this.renderDeletionList();
        });

        document.querySelectorAll('.filter-btn').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn === button));
                this.state.filter = button.dataset.range || 'all';
                this.renderDeletionList();
            });
        });
    }

    showValidation(message, error = false) {
        const el = document.getElementById('repoValidation');
        el.textContent = message;
        el.style.color = error ? '#ff8a96' : '#8ef7c3';
    }

    updateStatus(text, variant = 'neutral') {
        const statusPill = document.getElementById('statusPill');
        statusPill.textContent = text;
        statusPill.className = `status-pill ${variant}`;
    }

    normalizeRepo(repo) {
        const trimmed = repo.trim();
        if (!trimmed || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
            return null;
        }
        return trimmed;
    }

    async loadGraveyard(rawRepo, refresh = false) {
        const repo = this.normalizeRepo(rawRepo);
        if (!repo) {
            this.showValidation('Repository format is invalid. Use owner/repository-name.', true);
            return;
        }

        this.currentRepo = repo;
        this.showValidation('Recovering lost memories...');
        this.updateStatus(refresh ? 'Refreshing archive' : 'Opening repository crypt...', 'live');
        document.getElementById('repoInput').value = repo;

        try {
            const response = await fetch(`${this.apiUrl}/graveyard/${encodeURIComponent(repo)}`);
            const data = await response.json();

            if (!response.ok || !data || !Array.isArray(data.deletions)) {
                throw new Error(data?.error || 'Repository could not be loaded.');
            }

            this.applyData(data, false);
            this.updateStatus('Connected', 'live');
            this.showValidation('Repository archive loaded successfully.');
        } catch (error) {
            const demoData = buildDemoGraveyard(repo);
            this.applyData(demoData, true);
            this.updateStatus('Demo mode', 'demo');
            this.showValidation('Demo mode enabled: live GitHub data is unavailable right now.', false);
            this.showToast(error.message || 'No live archive connected. Showing a demo graveyard.', 'info');
        }
    }

    applyData(data, demoMode) {
        const deletions = Array.isArray(data.deletions) ? data.deletions : [];

        this.state.deletions = deletions;
        this.state.demoMode = demoMode;

        const latest = deletions.length ? deletions[deletions.length - 1] : null;
        this.state.selected = latest;

        document.getElementById('dashboard').classList.remove('hidden');
        document.getElementById('landingSection').classList.add('hidden');
        document.getElementById('repoNameLabel').textContent = this.currentRepo || 'owner/repo';

        this.renderStats();
        this.renderDeletionList();
        this.renderAnalytics();
        this.renderTimeline(deletions);
        this.visualizer.updateFromDeletions(deletions);
        this.renderMemoryPanel(this.state.selected);
    }

    renderStats() {
        const deletions = this.state.deletions;
        const totalLines = deletions.reduce((sum, item) => sum + (item.lines?.length || 0), 0);
        const uniqueFiles = new Set(deletions.flatMap(item => (item.lines || []).map(line => line.file)));
        const commitCount = deletions.length;
        const latest = deletions.reduce((latestItem, item) => {
            if (!latestItem) return item;
            return new Date(item.timestamp) > new Date(latestItem.timestamp) ? item : latestItem;
        }, null);

        document.getElementById('totalDeletions').textContent = this.formatCounter(totalLines);
        document.getElementById('totalFiles').textContent = this.formatCounter(uniqueFiles.size);
        document.getElementById('commitDeaths').textContent = this.formatCounter(commitCount);
        document.getElementById('lastDeletion').textContent = latest ? formatRelativeTime(latest.timestamp) : 'Never';
        document.getElementById('lastDeletionMeta').textContent = latest ? formatTimestamp(latest.timestamp) : 'No entries yet';
        document.getElementById('deltaDelete').textContent = `${Math.max(1, Math.round(totalLines / 10))} this week`;
        document.getElementById('fileDelta').textContent = `${Math.max(1, uniqueFiles.size)} haunted files`;
        document.getElementById('commitDelta').textContent = `${commitCount} tracked commits`;
    }

    formatCounter(value) {
        return new Intl.NumberFormat('en-US').format(value || 0);
    }

    getFilteredDeletions() {
        const search = this.state.search;
        const range = this.state.filter;
        const now = Date.now();

        let filtered = [...this.state.deletions];

        if (search) {
            filtered = filtered.filter(item => {
                const file = (item.lines || []).map(line => line.file).join(' ');
                const text = `${file} ${item.message || ''}`.toLowerCase();
                return text.includes(search);
            });
        }

        if (range === 'today') {
            filtered = filtered.filter(item => now - new Date(item.timestamp).getTime() <= 24 * 60 * 60 * 1000);
        }

        if (range === 'week') {
            filtered = filtered.filter(item => now - new Date(item.timestamp).getTime() <= 7 * 24 * 60 * 60 * 1000);
        }

        if (range === 'large') {
            filtered = filtered.filter(item => (item.lines || []).length >= 4);
        }

        return filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    renderDeletionList() {
        const list = document.getElementById('deletionList');
        const filtered = this.getFilteredDeletions();

        if (!filtered.length) {
            list.innerHTML = '<div class="empty-state memory-content">No souls in this filter. Try another repository or broaden the time window.</div>';
            return;
        }

        list.innerHTML = filtered.map(item => {
            const firstLine = item.lines?.[0] || {};
            const file = firstLine.file || 'unknown/file';
            const total = item.lines?.length || 0;
            const severity = total >= 6 ? 'critical' : total >= 3 ? 'medium' : 'low';
            const activeClass = this.state.selected && this.state.selected.commitId === item.commitId ? 'active' : '';

            return `
                <article class="deletion-item ${activeClass}" data-commit-id="${item.commitId}" tabindex="0">
                    <div class="deletion-item-head">
                        <span class="deletion-file">${escapeHtml(file)}</span>
                        <span class="severity-pill ${severity}">${severity}</span>
                    </div>
                    <p class="deletion-message">${escapeHtml(item.message || 'Code cleanup')}</p>
                    <div class="deletion-meta">
                        <span>${escapeHtml(item.author || 'Unknown')} • ${escapeHtml(formatRelativeTime(item.timestamp))}</span>
                        <span class="deletion-count">-${total} lines</span>
                    </div>
                </article>
            `;
        }).join('');

        list.querySelectorAll('.deletion-item').forEach(card => {
            card.addEventListener('click', () => {
                const item = filtered.find(entry => entry.commitId === card.dataset.commitId);
                if (item) {
                    this.state.selected = item;
                    this.renderMemoryPanel(item);
                    this.renderDeletionList();
                }
            });
        });
    }

    renderMemoryPanel(deletion) {
        const content = document.getElementById('memoryContent');

        if (!deletion) {
            this.renderEmptyMemory();
            return;
        }

        const file = deletion.lines?.[0]?.file || 'unknown/file';
        const codeLines = (deletion.lines || []).map(line => line.content || '').filter(Boolean);
        const snippet = codeLines.length ? codeLines.slice(0, 12).join('\n') : '// no deleted code recorded';

        content.classList.remove('empty-state');
        content.innerHTML = `
            <div>
                <h4>${escapeHtml(file)}</h4>
                <p class="deletion-message">${escapeHtml(deletion.message || 'Code cleanup')}</p>
            </div>
            <div class="memory-meta">
                <span>Author: ${escapeHtml(deletion.author || 'Unknown')}</span>
                <span>SHA: ${escapeHtml(deletion.commitId || 'unknown')}</span>
                <span>-${(deletion.lines || []).length} lines</span>
                <span>${escapeHtml(formatTimestamp(deletion.timestamp))}</span>
            </div>
            <pre class="code-block">${escapeHtml(snippet)}</pre>
        `;
    }

    renderEmptyMemory() {
        const content = document.getElementById('memoryContent');
        content.innerHTML = 'Select a deletion to inspect the lost code.';
        content.classList.add('empty-state');
    }

    renderAnalytics() {
        const deletions = this.state.deletions;
        const byFile = {};
        deletions.forEach(entry => {
            (entry.lines || []).forEach(line => {
                byFile[line.file] = (byFile[line.file] || 0) + 1;
            });
        });

        const topFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const maxValue = topFiles.length ? Math.max(...topFiles.map(([, value]) => value), 1) : 1;

        const bars = Array.from({ length: 7 }, (_, index) => {
            const total = deletions.filter(item => {
                const itemDate = new Date(item.timestamp);
                const daysBack = 6 - index;
                const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
                return itemDate >= cutoff && itemDate <= new Date();
            }).reduce((sum, item) => sum + (item.lines?.length || 0), 0);
            return total;
        });
        const maxBar = Math.max(...bars, 1);

        document.getElementById('analytics').innerHTML = `
            <div class="analytics-card">
                <div class="analytics-label"><span>Death frequency</span><strong>${this.formatCounter(Math.max(...bars, 0))}</strong></div>
                <div class="bar-chart">
                    ${bars.map(value => `<span class="bar" style="height:${Math.max((value / maxBar) * 100, 12)}%;"></span>`).join('')}
                </div>
            </div>
            <div class="analytics-card">
                <div class="analytics-label"><span>Top files</span><strong>${topFiles.length}</strong></div>
                <div class="file-list">
                    ${topFiles.map(([file, value]) => `
                        <div class="file-row">
                            <span>${escapeHtml(file)}</span>
                            <span>${value}</span>
                            <div class="track" style="grid-column:1 / -1;">
                                <div class="fill" style="width:${(value / maxValue) * 100}%"></div>
                            </div>
                        </div>
                    `).join('') || '<div class="file-row"><span>No file data yet</span></div>'}
                </div>
            </div>
        `;
    }

    renderTimeline(deletions) {
        const timelineEl = document.getElementById('timeline');
        const items = [...deletions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 6);

        if (!items.length) {
            timelineEl.innerHTML = '<div class="timeline-item"><span class="time">Awaiting</span><div class="title">No deletion history</div><div class="detail">Code has not yet entered the archive.</div></div>';
            return;
        }

        timelineEl.innerHTML = items.map(item => {
            const file = (item.lines || [])[0]?.file || 'unknown/file';
            return `
                <div class="timeline-item">
                    <span class="time">${escapeHtml(formatTimestamp(item.timestamp))}</span>
                    <div class="title">${escapeHtml(item.message || 'Cleanup')}</div>
                    <div class="detail">${escapeHtml(file)} • ${escapeHtml(item.author || 'Unknown')} • -${(item.lines || []).length} lines</div>
                </div>
            `;
        }).join('');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 2600);
    }

    showModal(title, body) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = body;
        document.getElementById('resurrectionModal').classList.remove('hidden');
    }

    hideModal() {
        document.getElementById('resurrectionModal').classList.add('hidden');
    }

    async resurrectCode() {
        if (!this.currentRepo) {
            this.showToast('Load a repository before attempting resurrection.', 'error');
            return;
        }

        const repo = encodeURIComponent(this.currentRepo);
        this.showToast('Resurrection sequence initiated...', 'info');

        try {
            const response = await fetch(`${this.apiUrl}/resurrect/${repo}`, { method: 'POST' });
            const data = await response.json();

            if (data && data.success) {
                const body = `
                    <p><strong>${escapeHtml(data.message)}</strong></p>
                    <p>Files restored: <strong>${escapeHtml(String(data.filesRestored || 0))}</strong></p>
                    <p>Lines restored: <strong>${escapeHtml(String(data.linesRestored || 0))}</strong></p>
                    ${data.url ? `<p><a href="${escapeHtml(data.url)}" target="_blank" rel="noreferrer">Open pull request</a></p>` : ''}
                `;
                this.showModal('Code resurrected', body);
                this.showToast(data.message || 'Resurrection complete.', 'success');
                return;
            }

            const message = data?.message || 'Resurrection could not be completed.';
            this.showModal('Resurrection status', `<p>${escapeHtml(message)}</p><p>${this.state.demoMode ? 'Demo mode is active, so no live GitHub mutation was attempted.' : 'Check GitHub access or repository permissions and try again.'}</p>`);
            this.showToast(message, 'error');
        } catch (error) {
            this.showModal('Resurrection unavailable', '<p>The service is unavailable right now. It may be running in demo mode.</p>');
            this.showToast('Resurrection service unavailable.', 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new GitHubGraveyardApp();
    window.openGhostMemory = (deletion) => {
        if (!deletion) return;
        window.app.state.selected = deletion;
        window.app.renderMemoryPanel(deletion);
        window.app.renderDeletionList();
    };
});