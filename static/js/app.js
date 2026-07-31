(function () {
    'use strict';

    const state = {
        videoStream: null,
        facingMode: 'user',
        capturedImage: null,
        originalImageData: null,
        cameraReady: false
    };

    const elements = {
        video: document.getElementById('video'),
        photoCanvas: document.getElementById('photoCanvas'),
        previewCanvas: document.getElementById('previewCanvas'),
        finalCanvas: document.getElementById('finalCanvas'),
        previewImage: document.getElementById('previewImage'),
        previewContainer: document.getElementById('previewContainer'),
        successMessage: document.getElementById('successMessage'),
        captureBtn: document.getElementById('captureBtn'),
        switchCameraBtn: document.getElementById('switchCameraBtn'),
        cameraFlash: document.getElementById('cameraFlash'),
        fileInput: document.getElementById('fileInput'),
        uploadArea: document.getElementById('uploadArea'),
        nameInput: document.getElementById('nameInput'),
        commentInput: document.getElementById('commentInput'),
        charCount: document.getElementById('charCount'),
        saveBtn: document.getElementById('saveBtn'),
        retakeBtn: document.getElementById('retakeBtn'),
        anotherPhotoBtn: document.getElementById('anotherPhotoBtn'),
        savedName: document.getElementById('savedName'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        toast: document.getElementById('toast'),
        cameraPanel: document.querySelector('[data-panel="camera"]'),
        uploadPanel: document.querySelector('[data-panel="upload"]'),
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabPanels: document.querySelectorAll('.tab-panel')
    };

    function vibrate(pattern) {
        try {
            if (navigator.vibrate) navigator.vibrate(pattern);
        } catch (e) {}
    }

    function init() {
        setupTabs();
        setupCamera();
        setupCaptureButton();
        setupSwitchCamera();
        setupFileUpload();
        setupDragAndDrop();
        setupForm();
        setupRetakeButton();
        setupAnotherPhotoButton();
        setupSaveButton();
        setupSmoothScroll();
        setupViewportFix();
    }

    function setupSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const href = this.getAttribute('href');
                if (href.length <= 1) return;
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
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

    function showToast(message, type) {
        elements.toast.textContent = message;
        elements.toast.className = 'toast show ' + (type || '');
        setTimeout(() => {
            elements.toast.className = 'toast hidden';
        }, 3200);
    }

    function setupTabs() {
        elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;
                elements.tabBtns.forEach(b => b.classList.remove('active'));
                elements.tabPanels.forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.querySelector(`[data-panel="${target}"]`).classList.add('active');
                vibrate(10);

                if (target === 'camera') {
                    startCamera();
                } else {
                    stopCamera();
                }
            });
        });
    }

    async function setupCamera() {
        const activePanel = document.querySelector('.tab-panel.active');
        if (activePanel && activePanel.dataset.panel === 'camera') {
            await startCamera();
        }
    }

    async function startCamera() {
        if (state.videoStream) {
            state.videoStream.getTracks().forEach(t => t.stop());
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Camera not supported on this device. Please use upload instead.', 'error');
            if (elements.captureBtn) elements.captureBtn.disabled = true;
            return;
        }

        try {
            state.videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: state.facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 2400 }
                },
                audio: false
            });

            elements.video.srcObject = state.videoStream;
            state.cameraReady = true;

            const track = state.videoStream.getVideoTracks()[0];
            if (track) {
                const settings = track.getSettings();
                if (!settings.facingMode) {
                    elements.switchCameraBtn.style.display = 'none';
                }
            }
        } catch (err) {
            console.error('Camera error:', err);
            showToast('Camera access denied. Please use upload option.', 'error');
            elements.switchCameraBtn.style.display = 'none';
        }
    }

    function stopCamera() {
        if (state.videoStream) {
            state.videoStream.getTracks().forEach(t => t.stop());
            state.videoStream = null;
        }
        state.cameraReady = false;
    }

    function setupCaptureButton() {
        elements.captureBtn.addEventListener('click', () => {
            if (!state.cameraReady) {
                showToast('Camera not ready. Please wait or use upload.', 'error');
                vibrate([20, 50, 20]);
                return;
            }
            vibrate(35);
            if (elements.cameraFlash) {
                elements.cameraFlash.classList.remove('active');
                void elements.cameraFlash.offsetWidth;
                elements.cameraFlash.classList.add('active');
            }
            setTimeout(() => capturePhoto(), 120);
        });
    }

    function setupSwitchCamera() {
        elements.switchCameraBtn.addEventListener('click', async () => {
            state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
            vibrate(20);
            await startCamera();
        });
    }

    function capturePhoto() {
        const video = elements.video;
        const canvas = elements.photoCanvas;

        let width = video.videoWidth;
        let height = video.videoHeight;

        const targetRatio = 4 / 5;
        let cropWidth = width;
        let cropHeight = width / targetRatio;

        if (cropHeight > height) {
            cropHeight = height;
            cropWidth = height * targetRatio;
        }

        const startX = (width - cropWidth) / 2;
        const startY = (height - cropHeight) / 2;

        const outputWidth = 1200;
        const outputHeight = Math.round(outputWidth / targetRatio);

        canvas.width = outputWidth;
        canvas.height = outputHeight;

        const ctx = canvas.getContext('2d');

        if (state.facingMode === 'user') {
            ctx.translate(outputWidth, 0);
            ctx.scale(-1, 1);
        }

        ctx.drawImage(
            video,
            startX, startY, cropWidth, cropHeight,
            0, 0, outputWidth, outputHeight
        );

        const imageData = canvas.toDataURL('image/jpeg', 0.92);
        handleCapturedImage(imageData);
    }

    function setupFileUpload() {
        elements.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) processFile(file);
            elements.fileInput.value = '';
        });

        elements.uploadArea.addEventListener('click', () => {
            elements.fileInput.click();
        });
    }

    function setupDragAndDrop() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            elements.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            elements.uploadArea.addEventListener(eventName, () => {
                elements.uploadArea.classList.add('dragging');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            elements.uploadArea.addEventListener(eventName, () => {
                elements.uploadArea.classList.remove('dragging');
            });
        });

        elements.uploadArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) processFile(files[0]);
        });
    }

    function processFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            cropImageToRatio(e.target.result, 4 / 5, (croppedData) => {
                handleCapturedImage(croppedData);
            });
        };
        reader.onerror = () => showToast('Error reading file.', 'error');
        reader.readAsDataURL(file);
    }

    function cropImageToRatio(imageDataUrl, ratio, callback) {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            let cropWidth, cropHeight, startX, startY;
            const currentRatio = width / height;

            if (currentRatio > ratio) {
                cropHeight = height;
                cropWidth = height * ratio;
                startX = (width - cropWidth) / 2;
                startY = 0;
            } else {
                cropWidth = width;
                cropHeight = width / ratio;
                startX = 0;
                startY = (height - cropHeight) / 2;
            }

            const canvas = document.createElement('canvas');
            const outputWidth = 1200;
            const outputHeight = Math.round(outputWidth / ratio);
            canvas.width = outputWidth;
            canvas.height = outputHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(
                img,
                startX, startY, cropWidth, cropHeight,
                0, 0, outputWidth, outputHeight
            );

            callback(canvas.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = () => showToast('Invalid image file.', 'error');
        img.src = imageDataUrl;
    }

    function handleCapturedImage(dataUrl) {
        stopCamera();
        state.capturedImage = dataUrl;
        state.originalImageData = dataUrl;

        const img = new Image();
        img.onload = () => {
            const prevCanvas = elements.previewCanvas;
            prevCanvas.width = img.width;
            prevCanvas.height = img.height;
            prevCanvas.getContext('2d').drawImage(img, 0, 0);

            renderFinalCanvas();

            elements.cameraPanel.parentElement.querySelector('.tabs').style.display = 'none';
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            elements.previewContainer.classList.remove('hidden');
            updateSaveButtonState();
        };
        img.src = dataUrl;
    }

    function setupForm() {
        elements.nameInput.addEventListener('input', () => {
            renderFinalCanvas();
            updateSaveButtonState();
        });

        elements.commentInput.addEventListener('input', () => {
            const len = elements.commentInput.value.length;
            elements.charCount.textContent = `${len}/300`;
            renderFinalCanvas();
        });
    }

    function updateSaveButtonState() {
        const hasName = elements.nameInput.value.trim().length > 0;
        const hasImage = !!state.capturedImage;
        elements.saveBtn.disabled = !(hasName && hasImage);
    }

    function renderFinalCanvas() {
        if (!state.originalImageData) return;

        const canvas = elements.finalCanvas;
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;

            ctx.drawImage(img, 0, 0);

            addPhotoOverlay(ctx, canvas.width, canvas.height);

            const name = elements.nameInput.value.trim() || 'Your Name';
            const comment = elements.commentInput.value.trim();

            const bottomPadding = 60 + (comment ? 70 : 0);
            const gradient = ctx.createLinearGradient(0, canvas.height - bottomPadding - 120, 0, canvas.height);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(0.3, 'rgba(0,0,0,0.55)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.85)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, canvas.height - bottomPadding - 100, canvas.width, bottomPadding + 120);

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 8;

            const baseFontSize = Math.max(20, Math.round(canvas.width / 20));
            ctx.font = `500 ${baseFontSize}px 'Playfair Display', Georgia, serif`;
            ctx.fillText(name, canvas.width / 2, canvas.height - 55 - (comment ? 65 : 0));

            const smallFontSize = Math.max(14, Math.round(baseFontSize * 0.55));
            ctx.font = `300 italic ${smallFontSize}px 'Montserrat', sans-serif`;
            ctx.fillStyle = 'rgba(245, 230, 200, 0.9)';
            ctx.fillText('EyA & HOUCEM  ♥  Forever', canvas.width / 2, canvas.height - 25);

            if (comment) {
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                const commentFontSize = Math.max(13, Math.round(baseFontSize * 0.5));
                ctx.font = `400 ${commentFontSize}px 'Montserrat', sans-serif`;
                const lines = wrapText(ctx, comment, canvas.width - 80);
                let y = canvas.height - 100;
                lines.slice(-2).forEach((line, i) => {
                    ctx.fillText(line, canvas.width / 2, y - (lines.slice(-2).length - 1 - i) * (commentFontSize + 6));
                });
            }

            ctx.shadowBlur = 0;
        };
        img.src = state.originalImageData;
    }

    function addPhotoOverlay(ctx, w, h) {
        const borderSize = Math.max(8, Math.round(w / 150));
        const cornerSize = borderSize * 5;

        ctx.strokeStyle = 'rgba(201, 169, 97, 0.35)';
        ctx.lineWidth = borderSize;
        ctx.strokeRect(borderSize / 2, borderSize / 2, w - borderSize, h - borderSize);

        ctx.strokeStyle = 'rgba(201, 169, 97, 0.7)';
        ctx.lineWidth = borderSize * 1.2;
        ctx.lineCap = 'round';

        const offset = borderSize * 3;
        const len = cornerSize;

        ctx.beginPath();
        ctx.moveTo(offset, offset + len);
        ctx.lineTo(offset, offset);
        ctx.lineTo(offset + len, offset);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(w - offset - len, offset);
        ctx.lineTo(w - offset, offset);
        ctx.lineTo(w - offset, offset + len);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(offset, h - offset - len);
        ctx.lineTo(offset, h - offset);
        ctx.lineTo(offset + len, h - offset);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(w - offset - len, h - offset);
        ctx.lineTo(w - offset, h - offset);
        ctx.lineTo(w - offset, h - offset - len);
        ctx.stroke();
    }

    function wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0] || '';

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + ' ' + word).width;
            if (width < maxWidth) {
                currentLine += ' ' + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    }

    function setupRetakeButton() {
        elements.retakeBtn.addEventListener('click', () => {
            vibrate(15);
            state.capturedImage = null;
            state.originalImageData = null;
            elements.nameInput.value = '';
            elements.commentInput.value = '';
            elements.charCount.textContent = '0/300';

            elements.previewContainer.classList.add('hidden');
            elements.successMessage.classList.add('hidden');
            elements.cameraPanel.parentElement.querySelector('.tabs').style.display = '';

            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) {
                const panel = activeTab.dataset.tab;
                document.querySelector(`[data-panel="${panel}"]`).classList.add('active');
                if (panel === 'camera') startCamera();
            } else {
                elements.tabBtns[0].classList.add('active');
                elements.cameraPanel.classList.add('active');
                startCamera();
            }
        });
    }

    function setupAnotherPhotoButton() {
        elements.anotherPhotoBtn.addEventListener('click', () => {
            elements.retakeBtn.click();
        });
    }

    function setupSaveButton() {
        elements.saveBtn.addEventListener('click', () => {
            if (elements.saveBtn.disabled) return;
            saveMemory();
        });
    }

    async function saveMemory() {
        const canvas = elements.finalCanvas;
        const photoData = canvas.toDataURL('image/jpeg', 0.88);
        const name = elements.nameInput.value.trim() || 'Anonymous';
        const comment = elements.commentInput.value.trim();

        const btnText = elements.saveBtn.querySelector('.btn-text');
        const spinner = elements.saveBtn.querySelector('.spinner');
        btnText.style.display = 'none';
        spinner.classList.remove('hidden');
        elements.saveBtn.disabled = true;
        elements.loadingOverlay.classList.remove('hidden');

        try {
            const response = await fetch('/save-memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: photoData, name, comment })
            });

            const result = await response.json();

            if (result.success) {
                elements.loadingOverlay.classList.add('hidden');
                elements.savedName.textContent = name;
                elements.previewContainer.classList.add('hidden');
                elements.successMessage.classList.remove('hidden');
                showToast('Memory saved successfully! ♥', 'success');
                vibrate([40, 60, 40]);
            } else {
                throw new Error(result.error || 'Failed to save');
            }
        } catch (err) {
            console.error('Save error:', err);
            elements.loadingOverlay.classList.add('hidden');
            showToast('Error saving memory. Please try again.', 'error');
            vibrate([50, 50, 50, 50, 50]);
            btnText.style.display = '';
            spinner.classList.add('hidden');
            elements.saveBtn.disabled = !(elements.nameInput.value.trim() && state.capturedImage);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
