// Three.js visualization for the graveyard
class GraveyardVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        
        this.init();
        this.animate();
    }

    init() {
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Dark background
        this.scene.background = new THREE.Color(0x0a0a0a);

        // Camera position
        this.camera.position.z = 15;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x66ff66, 1, 100);
        pointLight.position.set(10, 10, 10);
        this.scene.add(pointLight);

        // Resize handler
        window.addEventListener('resize', () => this.onResize());
    }

    addGhostText(text, position) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;
        
        ctx.fillStyle = 'transparent';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.font = 'Bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Glow effect
        ctx.shadowColor = 'rgba(102, 255, 102, 0.5)';
        ctx.shadowBlur = 20;
        ctx.fillStyle = 'rgba(102, 255, 102, 0.8)';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.position.set(position.x, position.y, position.z);
        sprite.scale.set(6, 1.5, 1);
        
        this.scene.add(sprite);
        return sprite;
    }

    addFloatingParticles() {
        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 1000;
        const posArray = new Float32Array(particlesCount * 3);

        for (let i = 0; i < particlesCount * 3; i += 3) {
            posArray[i] = (Math.random() - 0.5) * 30;
            posArray[i+1] = (Math.random() - 0.5) * 20;
            posArray[i+2] = (Math.random() - 0.5) * 30 - 5;
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        
        const particlesMaterial = new THREE.PointsMaterial({
            size: 0.05,
            color: 0x66ff66,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });

        const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
        this.scene.add(particlesMesh);
        this.particlesMesh = particlesMesh;
    }

    clearGhosts() {
        const toRemove = [];
        this.scene.children.forEach(child => {
            if (child.isSprite) {
                toRemove.push(child);
            }
        });
        toRemove.forEach(child => this.scene.remove(child));
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Rotate particles
        if (this.particlesMesh) {
            this.particlesMesh.rotation.y += 0.0005;
        }

        // Animate sprites (float up and down)
        this.scene.children.forEach((child, index) => {
            if (child.isSprite) {
                child.position.y += Math.sin(Date.now() * 0.001 + index) * 0.001;
                child.material.opacity = 0.4 + Math.sin(Date.now() * 0.002 + index) * 0.2;
            }
        });

        this.renderer.render(this.scene, this.camera);
    }
}

// Main Application
class GitHubGraveyardApp {
    constructor() {
        this.apiUrl = 'http://localhost:3000/api';
        this.currentRepo = null;
        this.visualizer = new GraveyardVisualizer('three-container');
        this.visualizer.addFloatingParticles();
        
        this.initEventListeners();
    }

    initEventListeners() {
        document.getElementById('loadRepoBtn').addEventListener('click', () => {
            const repoInput = document.getElementById('repoInput');
            const repo = repoInput.value.trim();
            if (repo) {
                this.loadGraveyard(repo);
            }
        });

        document.getElementById('resurrectBtn').addEventListener('click', () => {
            if (this.currentRepo) {
                this.resurrectCode();
            }
        });

        document.getElementById('closeModalBtn').addEventListener('click', () => {
            document.getElementById('resurrection-modal').classList.add('hidden');
        });

        // Load on Enter key
        document.getElementById('repoInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('loadRepoBtn').click();
            }
        });
    }

    async loadGraveyard(repo) {
        try {
            const response = await fetch(`${this.apiUrl}/graveyard/${encodeURIComponent(repo)}`);
            const data = await response.json();
            
            this.currentRepo = repo;
            this.updateStats(data.stats);
            this.updateDeletionList(data.deletions);
            this.updateVisualization(data.deletions);
            
        } catch (error) {
            console.error('Error loading graveyard:', error);
            alert('Failed to load graveyard data. Make sure the repository exists.');
        }
    }

    updateStats(stats) {
        document.getElementById('totalDeletions').textContent = stats.totalDeletions || 0;
        document.getElementById('totalFiles').textContent = (stats.totalFiles || []).length || 0;
        
        if (stats.lastUpdate) {
            const date = new Date(stats.lastUpdate);
            document.getElementById('lastDeletion').textContent = date.toLocaleString();
        }
    }

    updateDeletionList(deletions) {
        const container = document.getElementById('deletions');
        container.innerHTML = '';
        
        if (!deletions || deletions.length === 0) {
            container.innerHTML = '<p style="color: #666; text-align: center;">No deletions yet. Rest in peace... for now.</p>';
            return;
        }

        // Show latest 10 deletions
        const recent = deletions.slice(-10).reverse();
        
        recent.forEach(deletion => {
            const item = document.createElement('div');
            item.className = 'deletion-item';
            
            const fileInfo = deletion.lines && deletion.lines.length > 0 
                ? deletion.lines[0].file 
                : 'unknown file';
            
            item.innerHTML = `
                <div class="file">📄 ${fileInfo}</div>
                <div class="message">${deletion.message || 'No commit message'}</div>
                <div class="author">👤 ${deletion.author || 'Unknown'} • ${new Date(deletion.timestamp).toLocaleString()}</div>
                <div style="color: #662222; font-size: 0.8rem;">-${deletion.lines?.length || 0} lines deleted</div>
            `;
            
            container.appendChild(item);
        });
    }

    updateVisualization(deletions) {
        this.visualizer.clearGhosts();
        
        if (!deletions || deletions.length === 0) return;

        // Show ghosts for latest deletions
        const recent = deletions.slice(-20);
        
        recent.forEach((deletion, index) => {
            const text = deletion.lines && deletion.lines.length > 0 
                ? deletion.lines[0].content || '💀'
                : '💀';
                
            const position = {
                x: (Math.random() - 0.5) * 12,
                y: (Math.random() - 0.5) * 8,
                z: (Math.random() - 0.5) * 8 - 2
            };
            
            this.visualizer.addGhostText(text.substring(0, 20), position);
        });
    }

    async resurrectCode() {
        try {
            const response = await fetch(`${this.apiUrl}/resurrect/${encodeURIComponent(this.currentRepo)}`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showResurrectionModal(data);
                // Reload the graveyard to reflect changes
                setTimeout(() => this.loadGraveyard(this.currentRepo), 2000);
            } else {
                alert(data.message || 'Resurrection failed!');
            }
        } catch (error) {
            console.error('Error resurrecting code:', error);
            alert('Failed to resurrect code. The dead may rest today.');
        }
    }

    showResurrectionModal(data) {
        const modal = document.getElementById('resurrection-modal');
        const details = document.getElementById('resurrection-details');
        
        details.innerHTML = `
            <p style="color: #66ff66; font-size: 1.2rem;">${data.message}</p>
            <div style="margin-top: 20px; background: #111; padding: 15px; border-radius: 5px;">
                <p>📊 Statistics:</p>
                <ul style="list-style: none; margin-top: 10px;">
                    <li>🧟 Lines Restored: ${data.data.restoredLines?.length || 0}</li>
                    <li>📁 Files Affected: ${data.data.files?.length || 0}</li>
                    <li>⏰ Time of Resurrection: ${new Date(data.data.timestamp).toLocaleString()}</li>
                </ul>
            </div>
        `;
        
        modal.classList.remove('hidden');
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new GitHubGraveyardApp();
});