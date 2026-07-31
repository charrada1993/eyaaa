(function () {
    'use strict';

    const galleryGrid = document.getElementById('galleryGrid');
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxName = document.getElementById('lightboxName');
    const lightboxComment = document.getElementById('lightboxComment');
    const lightboxClose = document.getElementById('lightboxClose');
    const galleryCount = document.getElementById('galleryCount');

    window._handleImgError = function (imgEl) {
        if (imgEl.dataset.errorHandled) return;
        imgEl.dataset.errorHandled = '1';
        setTimeout(() => {
            if (!imgEl.naturalWidth || imgEl.naturalWidth === 0) {
                imgEl.style.display = 'none';
                const ph = imgEl.closest('.memory-photo');
                if (ph) ph.classList.add('no-photo');
            }
        }, 600);
    };

    function init() {
        applyServerRenderedPhotoData();
        formatMemoryDates();
        setupLightbox();
        setupAutoRefresh();
    }

    function applyServerRenderedPhotoData() {
        const scriptEl = document.getElementById('photoData');
        if (!scriptEl) return;
        try {
            const raw = scriptEl.textContent.trim();
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) return;
            const map = {};
            data.forEach(item => { if (item && item.i) map[item.i] = item.p; });
            const imgs = galleryGrid.querySelectorAll('img[data-photo="1"]');
            imgs.forEach(img => {
                const card = img.closest('.memory-card');
                const id = card ? card.dataset.id : '';
                if (id && map[id]) {
                    setImageSrc(img, map[id]);
                } else {
                    img.style.display = 'none';
                    const ph = img.closest('.memory-photo');
                    if (ph) ph.classList.add('no-photo');
                }
            });
        } catch (e) {
            console.warn('Failed to parse inline photo data:', e);
        }
    }

    function setImageSrc(img, url) {
        if (!url) return;
        try {
            img.src = url;
            if (img.complete && img.naturalWidth > 0) {
                img.style.display = '';
                return;
            }
            img.addEventListener('load', () => {
                img.style.display = '';
                const ph = img.closest('.memory-photo');
                if (ph) ph.classList.remove('no-photo');
            }, { once: true });
            img.addEventListener('error', () => {
                window._handleImgError(img);
            }, { once: true });
        } catch (e) {
            window._handleImgError(img);
        }
    }

    function formatMemoryDates() {
        const dateElements = document.querySelectorAll('.memory-date[data-timestamp]');
        dateElements.forEach(el => {
            const ts = el.dataset.timestamp;
            if (ts && !el.textContent.trim()) {
                el.textContent = formatDate(ts);
            }
        });
    }

    function formatDate(timestamp) {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHrs = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return diffMins + 'm ago';
            if (diffHrs < 24) return diffHrs + 'h ago';
            if (diffDays < 7) return diffDays + 'd ago';

            return date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
        } catch (e) {
            return '';
        }
    }

    function setupLightbox() {
        galleryGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.memory-card');
            if (!card) return;

            const img = card.querySelector('.memory-photo img');
            const name = card.querySelector('.memory-name');
            const comment = card.querySelector('.memory-comment');

            let src = '';
            if (img) {
                src = img.src || img.getAttribute('src') || '';
                if (!src) {
                    const id = card.dataset.id;
                    const scriptEl = document.getElementById('photoData');
                    try {
                        if (scriptEl) {
                            const data = JSON.parse(scriptEl.textContent.trim() || '[]');
                            const hit = data.find(d => d.i === id);
                            if (hit) src = hit.p;
                        }
                    } catch (_) { }
                }
            }

            if (src) {
                lightboxImage.removeAttribute('src');
                lightboxImage.style.visibility = 'hidden';
                lightboxImage.onload = () => { lightboxImage.style.visibility = ''; };
                lightboxImage.onerror = () => { lightboxImage.style.visibility = ''; };
                setTimeout(() => { lightboxImage.src = src; }, 10);
                lightboxImage.alt = img ? (img.alt || 'Memory photo') : 'Memory photo';
            }
            lightboxName.textContent = name ? name.textContent : 'Anonymous';
            lightboxComment.textContent = comment ? comment.textContent : '';
            lightboxComment.style.display = comment && comment.textContent ? '' : 'none';

            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        });

        const closeLightbox = () => {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
            setTimeout(() => {
                lightboxImage.src = '';
                lightboxImage.style.visibility = '';
            }, 300);
        };

        lightboxClose.addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lightbox.classList.contains('active')) {
                closeLightbox();
            }
        });
    }

    function setupAutoRefresh() {
        let lastCount = null;
        setInterval(async () => {
            try {
                const response = await fetch('/api/memories', { cache: 'no-store' });
                const result = await response.json();
                if (result && result.success) {
                    const currentCount = document.querySelectorAll('.memory-card').length;
                    if (result.memories.length !== currentCount &&
                        result.memories.length !== lastCount) {
                        lastCount = result.memories.length;
                        renderMemories(result.memories);
                    } else {
                        formatMemoryDates();
                    }
                }
            } catch (e) {
            }
        }, 20000);
    }

    function renderMemories(memories) {
        if (!memories || memories.length === 0) {
            galleryGrid.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                    </svg>
                    <h3>No Memories Yet</h3>
                    <p>Be the first to share a beautiful moment with EyA &amp; HOUCEM!</p>
                    <a href="/" class="btn-primary">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                        </svg>
                        Capture a Memory
                    </a>
                </div>
            `;
            if (galleryCount) galleryCount.textContent = '0';
            return;
        }

        if (galleryCount) galleryCount.textContent = memories.length;

        const frag = document.createDocumentFragment();
        memories.forEach(m => {
            const card = document.createElement('div');
            card.className = 'memory-card';
            card.dataset.id = m.id || '';

            const photoDiv = document.createElement('div');
            photoDiv.className = 'memory-photo';

            if (m.photo_url) {
                const img = document.createElement('img');
                img.alt = 'Memory by ' + (m.name || 'Anonymous');
                img.loading = 'lazy';
                img.setAttribute('onerror', 'window._handleImgError && window._handleImgError(this);');
                photoDiv.appendChild(img);
                setImageSrc(img, m.photo_url);
            } else {
                photoDiv.classList.add('no-photo');
            }
            card.appendChild(photoDiv);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'memory-info';

            const nameP = document.createElement('p');
            nameP.className = 'memory-name';
            nameP.textContent = m.name || 'Anonymous';
            infoDiv.appendChild(nameP);

            if (m.comment) {
                const cP = document.createElement('p');
                cP.className = 'memory-comment';
                cP.textContent = m.comment;
                infoDiv.appendChild(cP);
            }

            const dP = document.createElement('p');
            dP.className = 'memory-date';
            dP.dataset.timestamp = m.timestamp || '';
            dP.textContent = formatDate(m.timestamp || '');
            infoDiv.appendChild(dP);

            card.appendChild(infoDiv);
            frag.appendChild(card);
        });

        while (galleryGrid.firstChild) galleryGrid.removeChild(galleryGrid.firstChild);
        galleryGrid.appendChild(frag);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
