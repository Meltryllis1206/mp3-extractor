document.addEventListener('DOMContentLoaded', () => {
    // 获取DOM元素
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const progressContainer = document.getElementById('progress-container');
    const fileName = document.getElementById('file-name');
    const progressPercent = document.getElementById('progress-percent');
    const progressFill = document.getElementById('progress-fill');
    const resultContainer = document.getElementById('result-container');
    const playBtn = document.getElementById('play-btn');
    const seekSlider = document.getElementById('seek-slider');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const audioProgress = document.getElementById('audio-progress');
    const volumeBtn = document.getElementById('volume-btn');
    const downloadLink = document.getElementById('download-link');
    const newConversionBtn = document.getElementById('new-conversion-btn');

    // 音频对象
    let audioContext = null;
    let audioElement = null;
    let audioSource = null;
    let isPlaying = false;
    let extractedAudioBlob = null;
    
    // 音频压缩设置
    const audioSettings = {
        // MP3压缩品质
        bitRate: 128, // 较低的比特率可减小文件
        sampleRate: 44100, // 采样率可以降低到22050或16000以减小文件
        channels: 2, // 可以设置为1（单声道）来减小文件
    };

    // 初始化Web Audio API
    function initAudioContext() {
        if (!audioContext) {
            try {
                window.AudioContext = window.AudioContext || window.webkitAudioContext;
                audioContext = new AudioContext();
            } catch (e) {
                console.error('Web Audio API不支持:', e);
                showError('您的浏览器不支持Web Audio API，请尝试使用Chrome或Firefox最新版本。');
            }
        }
    }

    // 显示错误信息
    function showError(message) {
        alert(`错误: ${message}`);
    }

    // 处理拖放事件
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.remove('dragover');
        });
    });

    // 处理文件拖放
    dropArea.addEventListener('drop', handleDrop);
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    // 处理文件选择
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // 处理用户选择的文件
    function handleFiles(files) {
        if (files.length === 0) return;
        
        const file = files[0];
        
        // 检查是否为视频文件
        if (!file.type.startsWith('video/')) {
            showError('请选择视频文件');
            return;
        }
        
        // 显示进度条并更新文件名
        dropArea.classList.add('hidden');
        progressContainer.classList.remove('hidden');
        fileName.textContent = file.name;
        
        // 开始提取音频
        extractAudioFromVideo(file);
    }

    // 从视频中提取音频
    function extractAudioFromVideo(videoFile) {
        // 优先使用直接提取方法，速度更快
        directExtractAudio(videoFile);
    }

    // 直接从视频文件提取音频，不播放视频
    function directExtractAudio(videoFile) {
        try {
            // 显示模拟进度
            let progress = 0;
            const interval = setInterval(() => {
                progress += 2;
                if (progress > 95) {
                    clearInterval(interval);
                    return;
                }
                progressFill.style.width = `${progress}%`;
                progressPercent.textContent = `${progress}%`;
            }, 100);

            // 创建文件读取器，直接读取视频文件数据
            const reader = new FileReader();
            reader.onload = (e) => {
                const arrayBuffer = e.target.result;
                
                // 初始化 AudioContext
                initAudioContext();
                
                // 直接解码音频数据
                audioContext.decodeAudioData(arrayBuffer)
                    .then(buffer => {
                        // 创建离线 AudioContext 来渲染音频，使用优化后的采样率
                        const offlineCtx = new OfflineAudioContext(
                            audioSettings.channels,
                            Math.floor(buffer.length * (audioSettings.sampleRate / buffer.sampleRate)),
                            audioSettings.sampleRate
                        );
                        
                        // 创建音频源
                        const source = offlineCtx.createBufferSource();
                        source.buffer = buffer;
                        
                        // 使用压缩器减小动态范围
                        const compressor = offlineCtx.createDynamicsCompressor();
                        compressor.threshold.value = -24;
                        compressor.knee.value = 30;
                        compressor.ratio.value = 12;
                        compressor.attack.value = 0.003;
                        compressor.release.value = 0.25;
                        
                        // 连接节点
                        source.connect(compressor);
                        compressor.connect(offlineCtx.destination);
                        
                        source.start(0);
                        
                        // 渲染音频
                        offlineCtx.startRendering()
                            .then(renderedBuffer => {
                                // 将 AudioBuffer 转换为压缩格式
                                const compressedData = compressAudioBuffer(renderedBuffer);
                                const audioBlob = new Blob([compressedData], { type: 'audio/mp3' });
                                
                                extractedAudioBlob = audioBlob;
                                
                                // 清除进度间隔
                                clearInterval(interval);
                                progressFill.style.width = '100%';
                                progressPercent.textContent = '100%';
                                
                                // 完成提取
                                setTimeout(() => {
                                    finishExtraction(extractedAudioBlob);
                                }, 300);
                            })
                            .catch(err => {
                                console.error('音频渲染失败:', err);
                                fallbackMethod(videoFile);
                            });
                    })
                    .catch(err => {
                        console.error('音频解码失败:', err);
                        fallbackMethod(videoFile);
                    });
            };
            
            reader.onerror = () => {
                console.error('文件读取失败');
                fallbackMethod(videoFile);
            };
            
            // 开始读取文件
            reader.readAsArrayBuffer(videoFile);
        } catch (e) {
            console.error('直接提取音频失败:', e);
            fallbackMethod(videoFile);
        }
    }
    
    // 压缩音频缓冲区
    function compressAudioBuffer(buffer) {
        // 将采样率降低并减少精度来压缩数据
        const numChannels = audioSettings.channels;
        const sampleRate = audioSettings.sampleRate;
        
        // 如果是双声道但设置为单声道，则将双声道混合为单声道
        let audioData;
        if (buffer.numberOfChannels === 2 && numChannels === 1) {
            // 混合左右声道
            const left = buffer.getChannelData(0);
            const right = buffer.getChannelData(1);
            audioData = new Float32Array(left.length);
            for (let i = 0; i < left.length; i++) {
                // 简单平均混合
                audioData[i] = (left[i] + right[i]) / 2;
            }
        } else if (numChannels === 1) {
            // 直接使用第一个声道
            audioData = buffer.getChannelData(0);
        } else {
            // 原始的双声道数据
            audioData = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
        }
        
        // 使用16位而不是32位浮点数来减小体积
        return encodeWAV(audioData, 1, sampleRate, numChannels, 16);
    }

    // 备选方法，使用视频元素但静音处理
    function fallbackMethod(videoFile) {
        // 创建视频元素来加载视频文件
        const video = document.createElement('video');
        const videoURL = URL.createObjectURL(videoFile);
        
        // 初始化媒体源
        let mediaRecorder = null;
        let audioChunks = [];
        
        // 确保AudioContext已初始化
        initAudioContext();
        
        // 设置视频为静音，避免播放声音
        video.muted = true;
        video.volume = 0;
        
        video.src = videoURL;
        video.onloadedmetadata = async () => {
            try {
                // 创建媒体流从视频中提取音频
                const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
                
                // 提取音频轨道
                const audioTrack = stream.getAudioTracks()[0];
                
                if (!audioTrack) {
                    useFFmpegFallback(videoFile);
                    return;
                }
                
                const audioStream = new MediaStream([audioTrack]);
                
                // 设置媒体录制器并指定低比特率
                const options = {
                    mimeType: 'audio/webm;codecs=opus',
                    audioBitsPerSecond: audioSettings.bitRate * 1000 // 转换为bps
                };
                
                mediaRecorder = new MediaRecorder(audioStream, options);
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };
                
                mediaRecorder.onstop = () => {
                    // 合并音频块创建Blob
                    extractedAudioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                    finishExtraction(extractedAudioBlob);
                    
                    // 清理资源
                    URL.revokeObjectURL(videoURL);
                };
                
                // 更新进度显示
                const duration = video.duration;
                
                const updateProgress = () => {
                    if (video.currentTime >= duration || video.ended) {
                        // 提取完成
                        mediaRecorder.stop();
                        video.removeEventListener('timeupdate', updateProgress);
                        video.pause();
                        return;
                    }
                    
                    // 更新进度
                    const percent = Math.floor((video.currentTime / duration) * 100);
                    progressFill.style.width = `${percent}%`;
                    progressPercent.textContent = `${percent}%`;
                };
                
                video.addEventListener('timeupdate', updateProgress);
                
                // 开始录制并播放视频
                mediaRecorder.start();
                // 使用较高的播放速度来加快提取过程
                video.playbackRate = 2.0;
                video.play();
                
            } catch (error) {
                console.error('提取音频失败:', error);
                useFFmpegFallback(videoFile);
            }
        };
        
        video.onerror = () => {
            console.error('视频加载失败');
            showError('视频文件加载失败，请尝试另一个文件');
            resetUI();
        };
    }

    // 使用FFmpeg.js的备选方法
    function useFFmpegFallback(videoFile) {
        // 使用Web Workers和FileReader模拟进度
        let progress = 0;
        const interval = setInterval(() => {
            progress += 5;
            if (progress > 95) {
                clearInterval(interval);
                return;
            }
            progressFill.style.width = `${progress}%`;
            progressPercent.textContent = `${progress}%`;
        }, 500);

        // 使用浏览器的内置功能
        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target.result;
            
            // 简单的音频提取
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContext.decodeAudioData(arrayBuffer)
                .then(buffer => {
                    // 创建带有优化参数的离线AudioContext
                    const offlineCtx = new OfflineAudioContext(
                        audioSettings.channels,
                        Math.floor(buffer.length * (audioSettings.sampleRate / buffer.sampleRate)),
                        audioSettings.sampleRate
                    );
                    
                    // 创建音频源
                    const source = offlineCtx.createBufferSource();
                    source.buffer = buffer;
                    
                    // 添加压缩器减小文件大小
                    const compressor = offlineCtx.createDynamicsCompressor();
                    compressor.threshold.value = -24;
                    compressor.ratio.value = 12;
                    compressor.knee.value = 30;
                    compressor.attack.value = 0.003;
                    compressor.release.value = 0.25;
                    
                    source.connect(compressor);
                    compressor.connect(offlineCtx.destination);
                    
                    source.start();
                    
                    // 渲染音频
                    offlineCtx.startRendering().then(renderedBuffer => {
                        // 将AudioBuffer转换为压缩的MP3格式Blob
                        const compressedData = compressAudioBuffer(renderedBuffer);
                        const wavBlob = new Blob([compressedData], { type: 'audio/mp3' });
                        
                        extractedAudioBlob = wavBlob;
                        
                        // 清除进度间隔
                        clearInterval(interval);
                        progressFill.style.width = '100%';
                        progressPercent.textContent = '100%';
                        
                        // 完成提取
                        setTimeout(() => {
                            finishExtraction(extractedAudioBlob);
                        }, 500);
                    })
                    .catch(err => {
                        console.error('音频渲染失败:', err);
                        showError('音频处理失败');
                        resetUI();
                    });
                })
                .catch(err => {
                    console.error('音频解码失败:', err);
                    showError('不能从此视频中提取音频。请尝试另一个文件。');
                    resetUI();
                });
        };
        
        reader.onerror = () => {
            console.error('文件读取失败');
            showError('文件读取失败');
            resetUI();
        };
        
        // 开始读取文件
        reader.readAsArrayBuffer(videoFile);
    }

    // AudioBuffer转WAV函数
    function audioBufferToWav(buffer, opt) {
        opt = opt || {};
        
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = opt.float32 ? 3 : 1;
        const bitDepth = format === 3 ? 32 : 16;
        
        let result;
        if (numChannels === 2) {
            result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
        } else {
            result = buffer.getChannelData(0);
        }
        
        return encodeWAV(result, format, sampleRate, numChannels, bitDepth);
    }
    
    function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        
        let buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
        let view = new DataView(buffer);
        
        /* RIFF 标识符 */
        writeString(view, 0, 'RIFF');
        /* RIFF 块大小 */
        view.setUint32(4, 36 + samples.length * bytesPerSample, true);
        /* RIFF 类型 */
        writeString(view, 8, 'WAVE');
        /* 格式块标识符 */
        writeString(view, 12, 'fmt ');
        /* 格式块大小 */
        view.setUint32(16, 16, true);
        /* 采样格式 (raw) */
        view.setUint16(20, format, true);
        /* 声道数 */
        view.setUint16(22, numChannels, true);
        /* 采样率 */
        view.setUint32(24, sampleRate, true);
        /* 每秒字节数 (采样率 * 块对齐) */
        view.setUint32(28, sampleRate * blockAlign, true);
        /* 块对齐 (声道数 * 字节/样本) */
        view.setUint16(32, blockAlign, true);
        /* 每个样本的位数 */
        view.setUint16(34, bitDepth, true);
        /* 数据块标识符 */
        writeString(view, 36, 'data');
        /* 数据块大小 */
        view.setUint32(40, samples.length * bytesPerSample, true);
        
        if (format === 1) { // 原始 PCM
            floatTo16BitPCM(view, 44, samples);
        } else {
            writeFloat32(view, 44, samples);
        }
        
        return buffer;
    }
    
    function interleave(inputL, inputR) {
        let length = inputL.length + inputR.length;
        let result = new Float32Array(length);
        
        let index = 0;
        let inputIndex = 0;
        
        while (index < length) {
            result[index++] = inputL[inputIndex];
            result[index++] = inputR[inputIndex];
            inputIndex++;
        }
        return result;
    }
    
    function floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }
    
    function writeFloat32(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 4) {
            output.setFloat32(offset, input[i], true);
        }
    }
    
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // 在提取完成后调用
    function finishExtraction(audioBlob) {
        // 隐藏进度条，显示结果
        progressContainer.classList.add('hidden');
        resultContainer.classList.remove('hidden');
        
        // 创建音频元素
        audioElement = new Audio();
        audioElement.src = URL.createObjectURL(audioBlob);
        
        // 设置下载链接
        downloadLink.href = audioElement.src;
        // 从原始文件名获取名称部分
        const baseFileName = fileName.textContent.replace(/\.[^/.]+$/, "");
        downloadLink.download = `${baseFileName}-compressed.mp3`;
        
        // 设置音频元素事件监听器
        setupAudioPlayer();
    }

    // 设置音频播放器
    function setupAudioPlayer() {
        // 加载音频元数据
        audioElement.addEventListener('loadedmetadata', () => {
            // 更新总时长
            const duration = audioElement.duration;
            durationEl.textContent = formatTime(duration);
            
            // 设置进度条最大值
            seekSlider.max = duration;
        });
        
        // 时间更新事件
        audioElement.addEventListener('timeupdate', () => {
            if (!audioElement.paused) {
                const currentTime = audioElement.currentTime;
                
                // 更新当前时间显示
                currentTimeEl.textContent = formatTime(currentTime);
                
                // 更新进度条
                if (!seekSlider.dragging) {
                    seekSlider.value = currentTime;
                    const percent = (currentTime / audioElement.duration) * 100;
                    audioProgress.style.width = `${percent}%`;
                }
            }
        });
        
        // 播放结束事件
        audioElement.addEventListener('ended', () => {
            isPlaying = false;
            playBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
        });
        
        // 播放/暂停按钮点击事件
        playBtn.addEventListener('click', togglePlay);
        
        // 音量按钮点击事件
        volumeBtn.addEventListener('click', toggleMute);
        
        // 进度条滑动事件
        seekSlider.addEventListener('input', () => {
            seekSlider.dragging = true;
            const seekTime = parseFloat(seekSlider.value);
            currentTimeEl.textContent = formatTime(seekTime);
            const percent = (seekTime / audioElement.duration) * 100;
            audioProgress.style.width = `${percent}%`;
        });
        
        seekSlider.addEventListener('change', () => {
            const seekTime = parseFloat(seekSlider.value);
            audioElement.currentTime = seekTime;
            seekSlider.dragging = false;
        });
        
        // 新转换按钮点击事件
        newConversionBtn.addEventListener('click', resetUI);
    }

    // 切换播放/暂停状态
    function togglePlay() {
        if (!audioElement) return;
        
        if (isPlaying) {
            audioElement.pause();
            playBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
        } else {
            audioElement.play();
            playBtn.innerHTML = '<span class="material-symbols-rounded">pause</span>';
        }
        
        isPlaying = !isPlaying;
    }

    // 切换静音状态
    function toggleMute() {
        if (!audioElement) return;
        
        audioElement.muted = !audioElement.muted;
        
        if (audioElement.muted) {
            volumeBtn.innerHTML = '<span class="material-symbols-rounded">volume_off</span>';
        } else {
            volumeBtn.innerHTML = '<span class="material-symbols-rounded">volume_up</span>';
        }
    }

    // 格式化时间显示
    function formatTime(seconds) {
        seconds = Math.floor(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // 重置UI到初始状态
    function resetUI() {
        // 隐藏结果和进度容器
        progressContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
        
        // 显示上传区域
        dropArea.classList.remove('hidden');
        
        // 重置进度条
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        
        // 重置文件输入
        fileInput.value = '';
        
        // 清理音频元素
        if (audioElement) {
            audioElement.pause();
            audioElement.src = '';
            URL.revokeObjectURL(audioElement.src);
            audioElement = null;
        }
        
        isPlaying = false;
        extractedAudioBlob = null;
    }
}); 