class GraveyardVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x05070c, 12, 38);

        this.camera = new THREE.PerspectiveCamera(
            52,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.5, 14);

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
        const ambient = new THREE.AmbientLight(0xc2d6ff, 0.7);
        this.scene.add(ambient);

        const glow = new THREE.PointLight(0x68f0c5, 3.2, 45);
        glow.position.set(3, 4, 10);
        this.scene.add(glow);

        const accent = new THREE.PointLight(0x8a70ff, 2, 45);
        accent.position.set(-6, 2, 8);
        this.scene.add(accent);
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
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
    }

    makeGhostTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
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
            const content = line ? (line.content || '').replace(/\s+/g, ' ').trim() : 'deleted';
            const label = content.slice(0, 20) || 'forgotten';
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
        const x = ((index % 6) - 2.5) * 2.2 + (Math.random() - 0.5) * 1.5;
        const y = (Math.random() - 0.5) * 5.5;
        const z = ((index % 5) - 2) * 2.2 - 2;

        sprite.position.set(x, y, z);
        sprite.scale.set(4.5, 1.2, 1);
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

            const intersects = this.raycaster.intersectObjects(this.interactiveTargets, false);
            this.container.style.cursor = intersects.length ? 'pointer' : 'grab';
        });

        this.renderer.domElement.addEventListener('click', event => {
            const bounds = rect();
            const pointer = new THREE.Vector2(
                ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
                -((event.clientY - bounds.top) / bounds.height) * 2 + 1
            );

            this.raycaster.setFromCamera(pointer, this.camera);
            const intersects = this.raycaster.intersectObjects(this.interactiveTargets, false);
            if (intersects.length > 0 && typeof window.openGhostMemory === 'function') {
                const hit = intersects[0].object.userData.deletion;
                window.openGhostMemory(hit);
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
            this.particles.rotation.x = Math.sin(Date.now() * 0.00022) * 0.4;
        }

        this.ghosts.forEach((sprite, index) => {
            const t = Date.now() * 0.0016 + index;
            sprite.position.y += Math.sin(t) * 0.003;
            sprite.position.x += Math.cos(t * 0.9) * 0.0025;
            sprite.material.opacity = 0.45 + Math.sin(Date.now() * 0.003 + index) * 0.25;
        });

        const targetX = this.pointer.x * 1.8;
        const targetY = this.pointer.y * 1.2;
        this.camera.position.x += (targetX - this.camera.position.x) * 0.04;
        this.camera.position.y += (targetY + 1.4 - this.camera.position.y) * 0.05;
        this.camera.lookAt(0, 0, 0);

        this.renderer.render(this.scene, this.camera);
    }
}

window.GraveyardVisualizer = GraveyardVisualizer;