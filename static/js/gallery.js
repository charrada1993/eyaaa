(function () {
    'use strict';

    const galleryGrid = document.getElementById('galleryGrid');
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightboxImage');
    const lightboxName = document.getElementById('lightboxName');
    const lightboxComment = document.getElementById('lightboxComment');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxDelete = document.getElementById('lightboxDelete');
    const galleryCount = document.getElementById('galleryCount');
    const deleteModal = document.getElementById('deleteModal');
    const deletePasswordInput = document.getElementById('deletePasswordInput');
    const modalError = document.getElementById('modalError');
    const modalClose = document.getElementById('modalClose');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalConfirmBtn = document.getElementById('modalConfirmBtn');

    let currentMemoryId = null;

    function vibrate(pattern) {
        try {
            if (navigator.vibrate) navigator.vibrate(pattern);
        } catch (e) {}
    }

    let touchStartY = 0;
    let touchCurrentY = 0;
    let lightboxDragging = false;

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
        setupDeleteModal();
        setupAutoRefresh();
        setupViewportFix();
    }

    function setupDeleteModal() {
        if (!deleteModal) return;

        const closeModal = () => {
            deleteModal.classList.add('hidden');
            modalError.classList.add('hidden');
            deletePasswordInput.value = '';
            modalConfirmBtn.classList.remove('loading');
            modalConfirmBtn.disabled = false;
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
        };

        const openModal = () => {
            vibrate(30);
            modalError.classList.add('hidden');
            deletePasswordInput.value = '';
            deleteModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
            setTimeout(() => {
                try { deletePasswordInput.focus(); } catch (_) {}
            }, 150);
        };

        if (lightboxDelete) {
            lightboxDelete.addEventListener('click', () => {
                if (!currentMemoryId) return;
                openModal();
            });
        }

        modalClose.addEventListener('click', closeModal);
        modalCancelBtn.addEventListener('click', closeModal);
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) closeModal();
        });

        deletePasswordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                modalConfirmBtn.click();
            } else if (e.key === 'Escape') {
                closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !deleteModal.classList.contains('hidden')) {
                closeModal();
            }
        });

        modalConfirmBtn.addEventListener('click', async () => {
            if (!currentMemoryId) return;
            const pwd = deletePasswordInput.value;

            if (!pwd) {
                modalError.textContent = 'Please enter the password';
                modalError.classList.remove('hidden');
                vibrate([20, 30, 20]);
                return;
            }

            modalConfirmBtn.classList.add('loading');
            modalConfirmBtn.disabled = true;
            modalError.classList.add('hidden');

            try {
                const res = await fetch('/api/delete-memory', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: currentMemoryId, password: pwd })
                });

                const data = await res.json().catch(() => ({}));

                if (res.ok && data.success) {
                    vibrate([40, 80, 40]);
                    closeLightboxInternally();
                    closeModal();
                    removeCardById(currentMemoryId);
                    updateCountOnDelete();
                    showToastG('Memory deleted successfully', 'success');
                } else if (res.status === 403) {
                    modalError.textContent = 'Incorrect password';
                    modalError.classList.remove('hidden');
                    vibrate([50, 40, 50, 40, 50]);
                    deletePasswordInput.select();
                    deletePasswordInput.value = '';
                    setTimeout(() => { deletePasswordInput.value = pwd; }, 10);
                } else {
                    modalError.textContent = data.error || 'Failed to delete';
                    modalError.classList.remove('hidden');
                    vibrate([50, 50, 50]);
                }
            } catch (err) {
                console.error('Delete error:', err);
                modalError.textContent = 'Network error. Try again.';
                modalError.classList.remove('hidden');
                vibrate([50, 50, 50]);
            } finally {
                modalConfirmBtn.classList.remove('loading');
                modalConfirmBtn.disabled = false;
            }
        });
    }

    function closeLightboxInternally() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
        const content = lightbox.querySelector('.lightbox-content');
        if (content) {
            content.style.transform = '';
            content.style.opacity = '';
        }
    }

    function removeCardById(id) {
        const card = galleryGrid.querySelector(`.memory-card[data-id="${id}"]`);
        if (card) {
            card.style.transition = 'all 0.45s cubic-bezier(0.55, 0, 0.55, 0.2)';
            card.style.transform = 'scale(0.6) rotate(-6deg)';
            card.style.opacity = '0';
            setTimeout(() => {
                card.remove();
                checkEmptyState();
            }, 420);
        }
    }

    function updateCountOnDelete() {
        const totalCards = galleryGrid.querySelectorAll('.memory-card').length;
        const actual = Math.max(0, totalCards - 1);
        if (galleryCount) galleryCount.textContent = actual;
    }

    function checkEmptyState() {
        const remaining = galleryGrid.querySelectorAll('.memory-card').length;
        if (remaining > 0) return;
        const emptyTemplate = document.createElement('template');
        emptyTemplate.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
                <h3>No Memories Yet</h3>
                <p>Be the first to capture a beautiful moment from the wedding!</p>
                <a href="/" class="btn-primary">Capture a Photo</a>
            </div>`;
        galleryGrid.appendChild(emptyTemplate.content.firstElementChild);
    }

    function showToastG(msg, type = 'info') {
        let t = document.getElementById('__gtx');
        if (!t) {
            t = document.createElement('div');
            t.id = '__gtx';
            t.className = 'toast';
            document.body.appendChild(t);
        }
        t.className = 'toast';
        if (type) t.classList.add(type);
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._to);
        t._to = setTimeout(() => t.classList.remove('show'), 2600);
    }

    function setupViewportFix() {
        const setVh = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        setVh();
        window.addEventListener('resize', setVh);
        window.addEventListener('orientationchange', setVh);
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
            vibrate(20);

            currentMemoryId = card.dataset.id || null;

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
            document.body.style.touchAction = 'none';
        });

        const closeLightbox = () => {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
            vibrate(10);
            const content = lightbox.querySelector('.lightbox-content');
            if (content) {
                content.style.transform = '';
                content.style.opacity = '';
            }
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

        lightbox.addEventListener('touchstart', (e) => {
            if (!lightbox.classList.contains('active')) return;
            const touch = e.touches[0];
            touchStartY = touch.clientY;
            touchCurrentY = touch.clientY;
            lightboxDragging = true;
        }, { passive: true });

        lightbox.addEventListener('touchmove', (e) => {
            if (!lightboxDragging) return;
            const touch = e.touches[0];
            touchCurrentY = touch.clientY;
            const deltaY = touchCurrentY - touchStartY;
            if (deltaY > 0) {
                const content = lightbox.querySelector('.lightbox-content');
                if (content) {
                    const scale = Math.max(0.85, 1 - (deltaY / 1200));
                    content.style.transform = `translateY(${deltaY * 0.5}px) scale(${scale})`;
                    content.style.opacity = Math.max(0.4, 1 - (deltaY / 500));
                }
            }
        }, { passive: true });

        lightbox.addEventListener('touchend', () => {
            if (!lightboxDragging) return;
            lightboxDragging = false;
            const deltaY = touchCurrentY - touchStartY;
            if (deltaY > 120) {
                closeLightbox();
            } else {
                const content = lightbox.querySelector('.lightbox-content');
                if (content) {
                    content.style.transform = '';
                    content.style.opacity = '';
                }
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
                    <p>Be the first to share a beautiful moment with Houssem &amp; Eya!</p>
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
