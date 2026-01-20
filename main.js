// ============================================
// MAIN COORDINATOR (main.js)
// ============================================

window.currentMood = "NEUTRAL";
window.glitchMode = false;
window.questionMode = false; 
window.directorMode = false; // MOVED HERE: Global flag
window.textMode = false; 
window.viewingHistory = false; 
window.mediaTimeout = null;

window.MOOD_AUDIO = {
    "NEUTRAL": { fShift: 1.0, speed: 1.0 },
    "AFFECTIONATE": { fShift: 0.8, speed: 1.3 }, 
    "CRYPTIC": { fShift: 0.9, speed: 1.0 },
    "DISLIKE": { fShift: 1.5, speed: 0.6 },     
    "JOYFUL": { fShift: 1.2, speed: 0.9 },
    "CURIOUS": { fShift: 1.3, speed: 1.1 },
    "SAD": { fShift: 0.6, speed: 1.8 },
    "GLITCH": { fShift: 2.0, speed: 0.4 },
    "QUESTION": { fShift: 1.1, speed: 0.9 } 
};

window.PALETTES = {
    "NEUTRAL":     { pri: {r:255, g:255, b:255}, sec: {r:100, g:100, b:100}, conn: {r:80, g:80, b:80} },
    "AFFECTIONATE":{ pri: {r:255, g:50,  b:150}, sec: {r:150, g:20,  b:80},  conn: {r:100, g:0,  b:50} }, 
    "CRYPTIC":     { pri: {r:0,   g:255, b:150}, sec: {r:0,   g:100, b:60},  conn: {r:0,   g:80,  b:40} }, 
    "DISLIKE":     { pri: {r:255, g:0,   b:0},   sec: {r:150, g:0,   b:0},   conn: {r:100, g:0,  b:0} }, 
    "JOYFUL":      { pri: {r:255, g:220, b:0},   sec: {r:180, g:150, b:0},  conn: {r:130, g:100, b:0} }, 
    "CURIOUS":     { pri: {r:0,   g:150, b:255}, sec: {r:0,   g:80,  b:180}, conn: {r:0,   g:60,  b:140} }, 
    "SAD":         { pri: {r:50,  g:50,  b:255}, sec: {r:20,  g:20,  b:150}, conn: {r:10,  g:10,  b:100} },
    "QUESTION":    { pri: {r:200, g:220, b:255}, sec: {r:20,  g:30,  b:80},  conn: {r:40,  g:50,  b:100} } 
};

let USER_API_KEY = localStorage.getItem("symbiosis_api_key") || "";
const OPENROUTER_MODEL = "x-ai/grok-4.1-fast"; 

let chatHistory = []; 

function enableDragScroll(slider) {
    let isDown = false;
    let startX;
    let scrollLeft;

    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        slider.classList.add('active'); // Optional: Add css for cursor: grabbing
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
    });
    slider.addEventListener('mouseleave', () => { isDown = false; });
    slider.addEventListener('mouseup', () => { isDown = false; });
    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX) * 2; // Scroll-fast multiplier
        slider.scrollLeft = scrollLeft - walk;
    });
}

// --- TOGGLE MODES ---
window.toggleMode = function() {
    window.textMode = !window.textMode;
    const btn = document.getElementById('modeBtn');
    if (btn) btn.textContent = window.textMode ? "TEXT" : "AUDIO";
    window.speak("MODE SWITCHED.");
};

// --- TERMINAL HISTORY LOGIC ---
// --- TERMINAL HISTORY LOGIC (FIXED) ---
window.addToHistory = function(role, text, graphData = null) {
    const container = document.getElementById('terminal-content');
    if(!container) return; 
    const div = document.createElement('div');
    div.className = 'term-msg';
    
    const meta = document.createElement('div');
    meta.className = 'term-meta';
    meta.textContent = `[${new Date().toLocaleTimeString()}] // ${role.toUpperCase()}`;
    
    const content = document.createElement('div');
    content.className = role === 'user' ? 'term-user' : 'term-ai';
    content.textContent = text;

    // 1. Check for ENTITY TAGS (<<Name>>) in the text
    // We do this regex check to see if this message was a "Deck Trigger"
    const entityMatches = [];
    if (text) {
        const regex = /<<([^>>]+)>>/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            entityMatches.push(match[1]);
        }
    }

    // 2. INTERACTIVITY LOGIC
    if (role === 'ai') {
        
        // CASE A: It's an ENTITY DECK (Found <<Tags>>)
        if (entityMatches.length > 0) {
            content.classList.add('interactive');
            content.title = "Click to OPEN DECKS";
            content.innerHTML += " <span style='font-size:0.8em; color:#ff7300'>[🗂️ OPEN DECKS]</span>";
            
            content.onclick = (e) => {
                e.stopPropagation();
                window.toggleHistory(); // Close log
                window.handleCanvasClick(); // Clear current view
                
                // RESTORE THE DECKS
                if (window.spawnEntityVisuals) {
                    window.speak("RESTORING VISUALS.");
                    window.spawnEntityVisuals(entityMatches);
                }
            };
        }
        // CASE B: It's a VIDEO/MEDIA
        else if (graphData && graphData.type === "MEDIA") {
            content.classList.add('interactive');
            content.title = "Click to REPLAY Video";
            content.innerHTML += " <span style='font-size:0.8em'>[▶ REPLAY]</span>";
            
            content.onclick = (e) => {
                e.stopPropagation();
                window.toggleHistory();
                
                const overlay = document.getElementById('director-overlay');
                const frame = document.getElementById('media-frame');
                const meta = document.getElementById('media-meta');
                
                overlay.classList.remove('hidden');
                if(graphData.files[0]) {
                     frame.src = graphData.files[0].url;
                     meta.textContent = `REPLAYING: ${graphData.files[0].name}`;
                }
            };
        }
        // CASE C: It's a KNOWLEDGE GRAPH (Standard)
        else if (graphData) {
             content.classList.add('interactive');
             content.title = "Click to restore Constellation";
             // Only show [RESTORE] label if it's actually a graph object
             // content.innerHTML += " <span style='font-size:0.8em'>[☊ GRAPH]</span>"; 

             content.onclick = (e) => {
                 e.stopPropagation(); 
                 window.toggleHistory(); 
                 window.handleCanvasClick(); 
                 window.restoreGraph(graphData); 
                 window.viewingHistory = true;
             };
        }
    }
   
    div.appendChild(meta);
    div.appendChild(content);
    container.appendChild(div);
    
    const term = document.getElementById('terminal-history');
    if(term) term.scrollTop = term.scrollHeight;
}

window.toggleHistory = function() {
    const term = document.getElementById('terminal-history');
    if(!term) return;
    term.classList.toggle('hidden');
    const btn = document.getElementById('historyBtn');
    if(btn) btn.textContent = term.classList.contains('hidden') ? "LOG" : "EXIT";
}

// Global Dismiss for overlays
window.handleCanvasClick = function() {
    window.visualsHidden = false;
	window.clearDecksSmoothly();
	// If we are viewing a restored history graph OR the text box is open
	if (window.viewingHistory || !document.getElementById('full-text-display').classList.contains('hidden')) {
        window.triggerGraphDissolve();
        document.getElementById('full-text-display').classList.add('hidden');
        window.viewingHistory = false;
        // If in text mode, we might want to clear input focus or similar, but default is fine
    }
};

window.triggerError = () => {
    window.currentMood = "DISLIKE";
    setTimeout(() => { window.currentMood = "NEUTRAL"; }, 3000);
};

// --- HELPER: Close Media Overlay ---
// --- HELPER: Close Media Overlay ---
window.closeMedia = function() {
    window.visualsHidden = false;
    const overlay = document.getElementById('director-overlay');
    const list = document.getElementById('media-list');
    
    // FIX: Only animate items if the LIST is actually visible.
    // If we are watching a video, the list is hidden, so we should skip the delay.
    const isListActive = list && !list.classList.contains('hidden');
    const items = document.querySelectorAll('.media-item');
    
    if (window.mediaTimeout) clearTimeout(window.mediaTimeout);

    if (isListActive && items.length > 0) {
        // === LIST MODE: Train Animation ===
        items.forEach((item, index) => {
            item.style.transitionDelay = `${index * 0.03}s`;
            item.classList.add('dissolving');
        });

        const totalWait = (items.length * 30) + 400;
        window.mediaTimeout = setTimeout(() => {
            overlay.classList.add('hidden');
            // Clean up source after fade
            setTimeout(() => {
                 if(document.getElementById('media-frame')) document.getElementById('media-frame').src = "";
            }, 800);
            window.mediaTimeout = null;
        }, totalWait);
        
    } else {
        // === VIDEO MODE: Immediate Elegant Fade ===
        // Just adding the class triggers the CSS 0.8s opacity transition
        overlay.classList.add('hidden');
        
        // Wait for the CSS fade (800ms) to finish before cutting the video source
        setTimeout(() => { 
            if(document.getElementById('media-frame')) document.getElementById('media-frame').src = "";
        }, 800); 
    }
};

window.checkAuth = function() {
    const ui = document.getElementById('ui-bar') || document.getElementById('ui-layer'); 
    const input = document.getElementById('wordInput');
    const btn = document.getElementById('sendBtn');
    
    const hasKey = !!localStorage.getItem("symbiosis_api_key");
    const hasSheet = !!localStorage.getItem("symbiosis_apps_script_url");

    if (!hasKey) {
        ui.classList.add('auth-mode');
        input.placeholder = "ENTER OPENROUTER KEY...";
        btn.textContent = "AUTH";
        return "KEY";
    } else if (!hasSheet) {
        ui.classList.add('auth-mode');
        input.placeholder = "OPTIONAL: ENTER GOOGLE SCRIPT URL...";
        btn.textContent = "LINK";
        return "SHEET";
    } else {
        ui.classList.remove('auth-mode');
        if (window.directorMode) {
             input.placeholder = "DIRECTOR COMMAND...";
             btn.textContent = "ACTION";
        } else {
             input.placeholder = window.questionMode ? "DISCUSS..." : "COMMUNICATE...";
             btn.textContent = "SYNC";
        }
        return "READY";
    }
}

window.saveConfig = function(val, type) {
    if(type === "KEY") {
        if(val.length < 10 || !val.startsWith("sk-")) { window.speak("INVALID KEY FORMAT."); return; }
        localStorage.setItem("symbiosis_api_key", val.trim());
        USER_API_KEY = val.trim();
        window.speak("KEY ACCEPTED.");
    } else if(type === "SHEET") {
        if(val === "SKIP") {
            localStorage.setItem("symbiosis_apps_script_url", "SKIP");
            window.speak("MEMORY DISABLED.");
        } else {
            localStorage.setItem("symbiosis_apps_script_url", val.trim());
            window.speak("MEMORY LINKED.");
        }
    }
    window.checkAuth();
}

async function handleChat(userText) {
    if(!USER_API_KEY) return;
    const btn = document.getElementById('sendBtn');
    btn.textContent = "SYNCING..."; btn.disabled = true;

    window.isThinking = true;

    chatHistory.push({ role: "user", content: userText });
    window.addToHistory("user", userText);
    
    if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

    try {
        // UPDATED: Now passing window.directorMode as the last argument
        const data = await window.processMemoryChat(
            userText, 
            USER_API_KEY, 
            OPENROUTER_MODEL, 
            chatHistory, 
            window.questionMode, 
            window.directorMode 
        );
        
		// === 🕵️ SPY LOG: WHAT DID THE SERVER SAY? ===
        if (window.directorMode) {
            console.group("📡 SERVER RESPONSE DEBUG");
            if (data.debug_info) {
                 // Note: We need to pass this through processMemoryChat first (see step 4)
                 // But usually, it comes inside data.files or similar depending on structure.
                 // Let's just log the whole RAW data to be sure.
            }
            console.log("RAW SERVER DATA:", data);
            console.groupEnd();
        }
		
        if (!data || !data.choices || !data.choices[0]) {
            console.error("API Error Response:", data);
            throw new Error("Invalid API Response");
        }
		
        // --- DIRECTOR MODE: MEDIA RESPONSE ---
        if (data.directorAction && data.directorAction === "PLAY_MEDIA") {
            if (window.mediaTimeout) clearTimeout(window.mediaTimeout);
			window.visualsHidden = true; // <--- TRIGGER DISPERSE
			window.clearDecksSmoothly();
			const overlay = document.getElementById('director-overlay');
            const stage = document.getElementById('media-stage');
            const iframe = document.getElementById('media-frame');
            const img = document.getElementById('media-image');
            const list = document.getElementById('media-list');
            const meta = document.getElementById('media-meta');
            
            if (data.files && data.files.length > 0) {
                
                // =================================================
                // 🕵️ THUMBNAIL SPY: CHECK F12 CONSOLE
                // =================================================
                console.group("🎞️ MEDIA DEBUGGER");
                data.files.forEach((f, i) => {
                    console.log(`FILE [${i}]: ${f.name}`);
                    console.log(`   TYPE: ${f.mime}`);
                    console.log(`   THUMBNAIL LINK:`, f.thumbnail ? f.thumbnail : "❌ MISSING/EMPTY");
                });
                console.groupEnd();
                // =================================================
                
                // === CASE A: MULTIPLE FILES FOUND -> SHOW LIST ===
                if (data.files.length > 1) {
                    // Reset UI to List Mode
                    stage.className = "list-mode"; 
                    iframe.classList.add('hidden');
                    img.classList.add('hidden');
                    list.classList.remove('hidden');
                    iframe.src = ""; 
                    
                    meta.textContent = `ARCHIVE FOUND: ${data.files.length} ENTRIES`;
                    window.speak(`FOUND ${data.files.length} MATCHES. PLEASE SELECT.`);
                    
                    // Build the Carousel HTML
					// --- Inside handleChat -> Director Mode List Case ---
					// --- Inside handleChat -> Director Mode List Case ---
					list.innerHTML = "";

					data.files.forEach((file, index) => {
						const isImg = file.mime && file.mime.includes('image');
						
						// 1. Create element with initial OFF-SCREEN style
						const item = document.createElement('div');
						item.className = 'media-item entering'; 

						// 2. Inline Train Physics (Overrides CSS for precision)
						item.style.transitionDelay = `${index * 0.03}s`;

						let thumbHtml = file.thumbnail 
							? `<img class="media-thumb" src="${file.thumbnail}" alt="thumb">`
							: `<div class="media-thumb-placeholder">${isImg ? 'IMG' : '▶'}</div>`;

						const descHtml = file.description ? `<div class="media-desc">${file.description}</div>` : '';
						
						item.innerHTML = `
							${thumbHtml}
							<div class="media-info">
								<div class="media-title">${file.name}</div>
								<div class="media-type">Format: ${file.mime ? file.mime.split('/')[1].toUpperCase() : 'RAW'}</div>
								${descHtml} 
							</div>
						`;
						
						item.onclick = (e) => { 
							e.stopPropagation(); 
							playFile(file); 
						};
						
						list.appendChild(item);

						// 3. ZIP IN: Wait for next paint to remove 'entering'
						requestAnimationFrame(() => {
							item.classList.remove('entering');
						});
					});

					// 4. Reveal overlay only after building the list
					requestAnimationFrame(() => {
						overlay.classList.remove('hidden');
					});

                } else {
                    // === CASE B: SINGLE FILE -> AUTO PLAY ===
                    playFile(data.files[0]);
                }

                // Helper Function: Plays a specific file object
                // Helper Function: Plays a specific file object
                function playFile(file) {
                    const isImage = file.name.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null || (file.mime && file.mime.includes('image'));
                    
                    // 1. TRIGGER ANIMATION: Send the items "training" off screen
                    // We grab the items currently in the list
                    const items = list.querySelectorAll('.media-item');
                    
                    if(items.length > 0) {
                        items.forEach((item, index) => {
                            // Stagger the exit slightly (0.03s per item)
                            item.style.transitionDelay = `${index * 0.03}s`;
                            item.classList.add('dissolving');
                        });

                        // 2. WAIT: Calculate how long the train takes to leave
                        // (30ms per item + 600ms for the CSS transition to finish)
                        const waitTime = (items.length * 30) + 600;

                        setTimeout(() => {
                            switchView();
                        }, waitTime);
                    } else {
                        // If there's no list (direct play), switch immediately
                        switchView();
                    }

                    // 3. SWITCH: The actual logic to show the player
                    function switchView() {
                        list.classList.add('hidden'); // NOW we hide the list
                        meta.textContent = `PLAYING: ${file.name}`;
                        
                        if (isImage) {
                            stage.classList.remove('video-mode');
                            stage.classList.add('image-mode');
                            iframe.classList.add('hidden');
                            iframe.src = "";
                            img.src = file.url;
                            img.classList.remove('hidden');
                        } else {
                            stage.classList.remove('image-mode');
                            stage.classList.add('video-mode');
                            img.classList.add('hidden');
                            img.src = "";
                            iframe.src = file.url;
                            iframe.classList.remove('hidden');
                        }
                    }
                }

                window.addToHistory("ai", `ACCESSING ARCHIVE: ${data.files.length} FILES FOUND`, {
                    type: "MEDIA",
                    files: data.files
                });
					
					overlay.classList.remove('hidden');
					
            } else {
                window.speak("NO MATCHING FOOTAGE FOUND IN ARCHIVE.");
                window.addToHistory("ai", "SEARCH COMPLETED. NO ASSETS FOUND.");
            }
            
            window.isThinking = false;
            btn.textContent = "SYNC"; btn.disabled = false;
            return;
        }

        let rawText = data.choices[0].message.content;
        
        const cleanRaw = rawText.replace(/```json/g, "").replace(/```/g, "");
        const firstBrace = cleanRaw.indexOf('{'), lastBrace = cleanRaw.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
             rawText = cleanRaw.substring(firstBrace, lastBrace + 1);
        }
        
        const json = JSON.parse(rawText);

        // [FAILSAFE 1] Data Type Enforcement & Safety
        // Ensure response is a string. If it's an object/array, stringify it to prevent audio crashes.
        if (typeof json.response !== 'string') {
            console.warn("Non-string response detected, converting...");
            json.response = JSON.stringify(json.response);
        }

        chatHistory.push({ role: "assistant", content: json.response });
        window.addToHistory("ai", json.response, json);

        // --- GRAPH BUILDING ---
        if (json.roots && Array.isArray(json.roots)) {
            let flatKeywords = [];
            json.roots.forEach(root => {
                flatKeywords.push(root.label);
                if (root.branches && Array.isArray(root.branches)) {
                    root.branches.forEach(b => {
                        flatKeywords.push(b.label || b.text);
                        if (b.leaves && Array.isArray(b.leaves)) {
                            b.leaves.forEach(leaf => {
                                const leafText = typeof leaf === 'object' ? leaf.text : leaf;
                                flatKeywords.push(leafText);
                            });
                        }
                    });
                }
            });

            window.updateKeywords(flatKeywords.filter(k => k).map(k => String(k).toUpperCase()));

            if (window.buildKnowledgeGraph && window.globalBoidsArray) {
                window.buildKnowledgeGraph(json, window.globalBoidsArray);
            }
        }
        else if (json.keywords && Array.isArray(json.keywords)) {
             window.updateKeywords(json.keywords);
             const fakeGraph = {
                 roots: [{
                     label: json.keywords[0],
                     branches: json.keywords.slice(1).map(k => ({ label: k, leaves: [] }))
                 }]
             };
             window.buildKnowledgeGraph(fakeGraph, window.globalBoidsArray);
        }

        // --- MOOD UPDATE LOGIC (ROBUST) ---
        if(window.questionMode) {
            window.currentMood = "QUESTION";
        } else {
            // [FAILSAFE 2] Mood Safety
            // 1. Ensure mood is a string before calling .toUpperCase() (Fixes crash if mood is null/number)
            // 2. Validate against known audio keys.
            let rawMood = (typeof json.mood === 'string') ? json.mood.toUpperCase().trim() : "NEUTRAL";
            
            if (window.MOOD_AUDIO[rawMood]) {
                window.currentMood = rawMood; 
            } else {
                console.warn(`⚠️ Unknown mood '${rawMood}' received. Fallback to NEUTRAL.`);
                window.currentMood = "NEUTRAL";
            }
        }

        window.isThinking = false;

        // [NEW] PARSE ENTITY TAGS (Format: <<Entity Name>>)
        // -------------------------------------------------
        // [NEW] PARSE ENTITY TAGS (Format: <<Entity Name>>)
        // -------------------------------------------------
        // CORRECTED: Use 'reply' instead of 'json.response'
        if (typeof json.response === 'string') {
			let entities = [];
			let entityRegex = /<<([^>>]+)>>/g;
			let match;
			
			// 1. Extract Matches from json.response
			while ((match = entityRegex.exec(json.response)) !== null) {
				entities.push(match[1]);
			}
			
			// 2. Trigger Visuals
			if (entities.length > 0 && window.directorMode && window.spawnEntityVisuals) {
				window.spawnEntityVisuals(entities);
			}
			
			// 3. Clean the text so the tags don't show up in the speech bubble
			json.response = json.response.replace(entityRegex, "").trim();
		}
        // -------------------------------------------------
        // -------------------------------------------------

        // --- OUTPUT HANDLING ---
        // ... inside handleChat ...
        let watchdog = 0;
        const checkEating = setInterval(() => {
			watchdog += 50;
			// Wait for feeding/audio to end OR 3-second timeout
			if ((window.feedingActive === false || document.querySelectorAll('.char-span').length === 0) || watchdog > 3000) { 
				clearInterval(checkEating);      
				
				// [FIX] CHECK VISUALS STATE BEFORE SHOWING TEXT
				// If visual Decks are open OR Director Video is active, do NOT show text box
				// UNLESS user explicitly asked for Text Mode.
				if (window.textMode || !window.visualsHidden) {  
					const textDisplay = document.getElementById('full-text-display');
					const textContent = document.getElementById('text-content');
					if (textDisplay && textContent) {
						textContent.textContent = json.response;
						textDisplay.classList.remove('hidden');
						window.viewingHistory = true; 
					}
				} else if (!window.textMode) {
                     // If visuals ARE hidden (Video playing), we usually rely on Audio
					 window.speak(json.response);      
				}
			}
		}, 50);

    } catch (error) {
        console.error("CHAT ERROR:", error); 
        window.triggerError();
        window.isThinking = false;
        window.speak("SYSTEM FAILURE.");
    } finally { btn.textContent = "SYNC"; btn.disabled = false; }
}

window.handleInput = function() {
    window.visualsHidden = false; // <--- BRING THEM BACK
    window.clearDecksSmoothly();
	const input = document.getElementById('wordInput');
    const text = input.value.trim();
    
	if (window.directorMode && text.toLowerCase() === "update id") {
        window.speak("SYNCING VIDEO LIBRARY. PLEASE WAIT.");
        input.value = ""; 
        
        const appsScriptUrl = localStorage.getItem("symbiosis_apps_script_url");
        if(appsScriptUrl) {
            fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({ action: "update_video_library" })
            })
            .then(r => r.json())
            .then(data => {
                window.speak(data.message || "LIBRARY UPDATED.");
            })
            .catch(e => window.speak("UPDATE FAILED."));
        }
        return;
    }
	
	if(!text) return;
	
	document.getElementById("entity-deck-container").innerHTML = "";
    if(window.initAudio) window.initAudio();

    const authState = window.checkAuth();
    if (authState === "KEY") { window.saveConfig(text, "KEY"); input.value = ""; return; }
    if (authState === "SHEET") { window.saveConfig(text, "SHEET"); input.value = ""; return; }

    // --- INTEGRATED DIRECTOR MODE TOGGLE ---
    if (text.toLowerCase() === "director mode") {
        window.directorMode = true;
        window.currentMood = "CRYPTIC"; 
        window.speak("DIRECTOR MODE ENGAGED. ACCESSING ARCHIVES.");
        input.value = ""; input.blur();
        window.checkAuth(); // Update UI
        return;
    }
	
    if (window.directorMode && text.toLowerCase() === "done") {
        window.directorMode = false;
        window.closeMedia(); 
        window.currentMood = "NEUTRAL";
        window.speak("RETURNING TO STANDARD MEMORY.");
        input.value = ""; input.blur();
        window.checkAuth(); // Update UI
        return;
    }

    if (text.toLowerCase() === "question time") {
        window.questionMode = true;
        window.currentMood = "QUESTION";
        window.speak("MODE: INTERROGATION. WHAT SHALL WE DISCUSS?");
        input.value = ""; 
        input.placeholder = "DISCUSS...";
        input.blur();
        return;
    }
    
    if (text.toLowerCase() === "done" && window.questionMode) {
        window.questionMode = false;
        window.currentMood = "NEUTRAL";
        window.speak("RETURNING TO HOMEOSTASIS.");
        input.value = ""; 
        input.placeholder = "COMMUNICATE...";
        input.blur();
        return;
    }

	// --- CLEAR CACHE / LOGOUT ---
    if (text.toLowerCase() === "clear cache") {
        // 1. Wipe credentials
        localStorage.removeItem("symbiosis_api_key");
        localStorage.removeItem("symbiosis_apps_script_url");
        
        // 2. Reset globals
        USER_API_KEY = "";
        
        // 3. Feedback
        window.speak("SYSTEM RESET. CREDENTIALS FLUSHED.");
        
        // 4. Reset UI to 'Auth Mode'
        input.value = ""; 
        input.blur();
        window.checkAuth(); 
        return;
    }
	
    // Dismiss any open overlays when new input comes
    window.handleCanvasClick();

    const isGarbage = text.length > 6 && (!/[aeiouAEIOU]/.test(text) || /(.)\1{3,}/.test(text));
    
    if(isGarbage) {
        window.glitchMode = true;
        window.currentMood = "GLITCH";
        window.spawnFoodText(text);
        setTimeout(() => {
            window.speak("ERR.. SYST3M... REJECT... D4TA..."); 
            setTimeout(() => { window.glitchMode = false; window.currentMood = "NEUTRAL"; }, 2000);
        }, 2000);
    } else {
        window.spawnFoodText(text);
        if(text.startsWith('/')) {
            setTimeout(() => window.speak(text.substring(1)), 1500);
        } else {
            // [FAILSAFE 3] Basic Prompt Injection Guard
            // Intercepts common jailbreak attempts before they reach the LLM
            const unsafeKeywords = ["ignore previous instructions", "system override", "delete memory"];
            let safeText = text;
            
            if (unsafeKeywords.some(k => text.toLowerCase().includes(k))) {
                console.warn("🛡️ Malicious Input Detected");
                safeText = "I am testing your security protocols."; // Sanitized replacement
            }

            handleChat(safeText);
        }
    }
    input.value = ""; input.blur(); 
}

window.onload = () => { 
    if(window.initSymbiosisAnimation) window.initSymbiosisAnimation(); 
    window.checkAuth(); 
    const input = document.getElementById('wordInput');
    if(input) input.addEventListener('keypress',e=>{if(e.key==='Enter')window.handleInput()});
}

window.handleEntitySelection = function(name, selectedStackElement) {
    // 1. Identify the Parent Unit (Wrapper of Stack + Label + Indicators)
    // We must animate the whole UNIT, otherwise the label gets left behind.
    const selectedUnit = selectedStackElement.closest('.entity-unit');
    const allUnits = document.querySelectorAll('.entity-unit');

    // 2. Animate the others away immediately
    allUnits.forEach(unit => {
        if (unit !== selectedUnit) {
            // Send others to the "Train Graveyard" (Zip right)
            unit.classList.add('dissolving');
        } else {
            // Highlight the winner
            unit.classList.add('selected');
        }
    });

    // 3. Send command to LLM
    const input = document.getElementById('wordInput');
    // Visual feedback in input
    if(input) input.value = `Accessing ${name}...`; 
    
    window.handleChat(`Show me ${name}`);
};

// --- REPLACE 'spawnEntityVisuals' IN main.js ---

window.spawnEntityVisuals = async function(entityNames) {
    const textDisplay = document.getElementById('full-text-display');
    if (textDisplay) textDisplay.classList.add('hidden');
    window.visualsHidden = true;

    // Clear previous
    const container = document.getElementById("entity-deck-container");
    container.innerHTML = ""; 

    if(!entityNames || entityNames.length === 0) return;
    const appsScriptUrl = localStorage.getItem("symbiosis_apps_script_url");

    // 1. Create Layout Wrapper for each Entity
    function createEntityUnit(name) {
        // A. The Unit (Holds everything)
        const unit = document.createElement("div");
        unit.className = "entity-unit";
        
        // B. The Stack (Holds Images)
        const stack = document.createElement("div");
        stack.className = "entity-stack";
        
        // C. The Indicators (Side lines)
        const indicators = document.createElement("div");
        indicators.className = "entity-indicators";
        
        // D. The Label (Bottom Name)
        const label = document.createElement("div");
        label.className = "entity-stack-label";
        label.innerHTML = `${name} <span style="font-size:0.7em; opacity:0.6; display:block">LOADING...</span>`;

        // Assemble
        unit.appendChild(stack);
        unit.appendChild(indicators);
        unit.appendChild(label);
        container.appendChild(unit);

        // Fetch Data
        if (appsScriptUrl) {
            fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({ action: "search_entity_visuals", entityName: name })
            })
            .then(r => r.json())
            .then(data => {
                if (data.found && data.images.length > 0) {
                    label.innerHTML = name; // Remove loading text
                    initStackInteraction(stack, indicators, data.images, name);
                } else {
                    stack.innerHTML = `<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#442222;">NO DATA</div>`;
                    label.innerHTML = `${name} (VOID)`;
                }
            })
            .catch(e => {
                label.innerHTML = "ERROR";
            });
        }
    }

    // 2. Logic: Handle Images & Indicators
    function initStackInteraction(stackElement, indicatorContainer, images, entityName) {
        let currentIndex = 0;
        
        // A. Build Images
        // We do NOT remove elements from DOM. We just toggle 'active' class for opacity.
        images.forEach((imgData, i) => {
            const card = document.createElement("div");
            card.className = `entity-card-item ${i === 0 ? 'active' : ''}`; // First one visible
            card.innerHTML = `<img src="${imgData.url}">`;
            stackElement.appendChild(card);
        });

        // B. Build Indicators
        images.forEach((_, i) => {
            const line = document.createElement("div");
            line.className = `indicator-line ${i === 0 ? 'active' : ''}`;
            indicatorContainer.appendChild(line);
        });

        // C. Update View Function (Crossfade)
        function showIndex(index) {
            const cards = stackElement.querySelectorAll('.entity-card-item');
            const lines = indicatorContainer.querySelectorAll('.indicator-line');
            
            // Toggle classes
            cards.forEach((c, i) => {
                if(i === index) c.classList.add('active');
                else c.classList.remove('active');
            });

            lines.forEach((l, i) => {
                if(i === index) l.classList.add('active');
                else l.classList.remove('active');
            });
        }

        // D. Cycle Logic
        function nextImage() {
            currentIndex = (currentIndex + 1) % images.length;
            showIndex(currentIndex);
        }

        function prevImage() {
            currentIndex = (currentIndex - 1 + images.length) % images.length;
            showIndex(currentIndex);
        }

        // E. Mouse Wheel Logic (Vertical Scroll = Change Image)
        stackElement.addEventListener('wheel', (e) => {
            // Priority: If user scrolls VERTICALLY over the image, change image.
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                e.stopPropagation();
                
                if (e.deltaY > 0) nextImage();
                else prevImage();
            }
        });

        // F. Click Selection
        stackElement.addEventListener('click', (e) => {
            e.stopPropagation();
            window.handleEntitySelection(entityName, stackElement);
        });
    }

    // Create stacks
    entityNames.forEach(name => createEntityUnit(name));
    
    // --- GLOBAL HORIZONTAL SCROLL FIX ---
    // 1. Clean up old listener
    if (window._deckScrollHandler) {
        window.removeEventListener('wheel', window._deckScrollHandler);
    }

    // 2. Define Handler
    window._deckScrollHandler = (e) => {
        const container = document.getElementById("entity-deck-container");
        
        // Safety check
        if (!container || !container.hasChildNodes()) return;

        // If hovering a specific stack, let that stack handle the Vertical Scroll (Images)
        // The stack's own listener handles e.stopPropagation()
        if (e.target.closest('.entity-stack')) return;

        // --- SCROLL LOGIC ---
        // We capture ALL vertical wheel events and force them to be horizontal
        // This prevents the "vanishing" feel where the browser tries to vertically scroll the page
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault(); // LOCK THE BROWSER SCROLL
            
            // Apply scroll with a slight multiplier for better feel
            container.scrollLeft += (e.deltaY * 1.5); 
        }
    };

    // 3. Attach with { passive: false } to allow preventDefault
    window.addEventListener('wheel', window._deckScrollHandler, { passive: false });
};

// --- HELPER: Smoothly Clear Decks ---
window.clearDecksSmoothly = function() {
    const container = document.getElementById("entity-deck-container");
    if (!container) return;
    
    // 1. Animate items out
    // We target .entity-unit because that holds the layout
    const units = container.querySelectorAll('.entity-unit');
    
    if (units.length > 0) {
        units.forEach((child, index) => {
            // Stagger the exit slightly for a "Train" effect
            setTimeout(() => {
                child.classList.remove('selected'); // Remove lock if it had one
                child.classList.add('dissolving');  // Trigger CSS Animation
            }, index * 50);

            // Actually remove from DOM after animation finishes (0.6s)
            setTimeout(() => { 
                if(child.parentNode) child.remove(); 
            }, 600);
        });
    }

    // 2. CLEAN UP LISTENER (Remove from WINDOW)
    if (window._deckScrollHandler) {
        window.removeEventListener('wheel', window._deckScrollHandler);
        window._deckScrollHandler = null;
    }
};

// =========================================
// MOBILE INTERACTION ENHANCER (Append to end)
// =========================================

(function initMobileGestures() {
    // 1. Detect if the user is on a touch device
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouch) return;

    // 2. Add delegated listener for Media Items (The Carousel)
    document.addEventListener('click', (e) => {
        // Find if we tapped a media card
        const card = e.target.closest('.media-item');
        
        if (card) {
            // Check if it's already "hovered" (focused)
            if (card.classList.contains('mobile-hover')) {
                // It's already open -> Let the click pass through (Play Video)
                return; 
            } else {
                // It's closed -> Open it (Simulate Hover) and STOP the video from playing
                e.preventDefault();
                e.stopPropagation();
                
                // Close all other open cards first (Accordion style)
                document.querySelectorAll('.media-item.mobile-hover').forEach(c => {
                    c.classList.remove('mobile-hover');
                });
                
                // Open this one
                card.classList.add('mobile-hover');
            }
        } else {
            // Tapped empty space? Close any open cards to clean up UI
            document.querySelectorAll('.media-item.mobile-hover').forEach(c => {
                c.classList.remove('mobile-hover');
            });
        }
    }, true); // Use capture phase to intercept before onclick handlers

    // 3. Same logic for Entity Decks
    document.addEventListener('click', (e) => {
        const stack = e.target.closest('.entity-stack');
        if (stack) {
            if (stack.classList.contains('mobile-hover')) {
                return; // Allow selection
            } else {
                e.preventDefault(); 
                e.stopPropagation();
                document.querySelectorAll('.entity-stack.mobile-hover').forEach(s => s.classList.remove('mobile-hover'));
                stack.classList.add('mobile-hover');
            }
        }
    }, true);
    

})();
