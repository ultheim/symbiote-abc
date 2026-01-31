// ============================================
// MEMORY MODULE (memory.js) - HYBRID ATOMIC SYSTEM
// V1 Narrative Precision + V2 Safety Guardrails
// ============================================

window.hasRestoredSession = false;
const MAX_RETRIES = 3;

// --- 1. INITIALIZE SESSION (V2 Feature) ---
window.initializeSymbiosisSession = async function() {
    const appsScriptUrl = localStorage.getItem("symbiosis_apps_script_url");
    if (!appsScriptUrl) return;

    try {
        console.log("🔄 Restoring Short-term Memory...");
        const req = await fetch(appsScriptUrl, {
            method: "POST",
            mode: "cors",            
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "get_recent_chat" })
        });
        const res = await req.json();
        
        if (res.history && Array.isArray(res.history)) {
            window.chatHistory = res.history.map(row => ({ 
                role: row[1], 
                content: row[2], 
                timestamp: row[0] 
            }));
            
            // Time Gap Logic
            if (window.chatHistory.length > 0) {
                const lastMsg = window.chatHistory[window.chatHistory.length - 1];
                const lastTime = new Date(lastMsg.timestamp).getTime();
                const now = new Date().getTime();
                const hoursDiff = (now - lastTime) / (1000 * 60 * 60);

                if (hoursDiff > 6) {
                    console.log(`🕒 Time Gap Detected: ${hoursDiff.toFixed(1)} hours`);
                    window.chatHistory.push({
                        role: "system",
                        content: `[SYSTEM_NOTE: The user has returned after ${Math.floor(hoursDiff)} hours. Treat this as a new session context, but retain previous memories.]`
                    });
                }
            }
            console.log("✅ Session Restored:", window.chatHistory.length, "msgs");
        }
    } catch (e) { console.error("Session Restore Failed", e); }
};

// --- SYNAPTIC RETRY ENGINE (V2 Reliability) ---
// [FIX] Added Exponential Backoff & Strict Status Checks
async function fetchWithCognitiveRetry(messages, model, apiKey, validatorFn, label) {
    let attempts = 0;
    let delay = 1000; // Start waiting 1 second

    while (attempts < MAX_RETRIES) {
        try {
            console.log(`🧠 ${label} (Attempt ${attempts + 1})...`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s Hard Timeout

            // ... inside fetchWithCognitiveRetry ...
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.href, 
                    "X-Title": "Symbiosis"
                },
                // [FIX] Added parameters to DISABLE reasoning for speed
                body: JSON.stringify({
                    "model": model,
                    "messages": messages,
                    "response_format": { type: "json_object" },
                    
                    // 1. OpenRouter standard flag to hide/skip reasoning
                    "include_reasoning": false, 
                    
                    // 2. Specific xAI/Grok parameter (if passed through)
                    "reasoning": { "enabled": false } 
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            // [FAILSAFE 1] Check HTTP Status explicitly
            if (!response.ok) {
                // If 401 (Auth) or 403 (Forbidden), do NOT retry. It won't fix itself.
                if (response.status === 401 || response.status === 403) {
                    throw new Error(`CRITICAL AUTH ERROR ${response.status}: Check API Key.`);
                }
                // For 429 (Rate Limit) or 500 (Server), throw to trigger the retry logic
                throw new Error(`API Error ${response.status}`);
            }

            const data = await response.json();
            
            // [FAILSAFE 2] JSON Validation
            let parsedContent;
            try {
                parsedContent = JSON.parse(data.choices[0].message.content);
            } catch (jsonErr) {
                console.warn(`${label}: JSON Parse failed.`, data.choices[0].message.content);
                throw new Error("Invalid JSON structure received");
            }

            // [FAILSAFE 3] Schema Validation (using the validator function passed in)
            if (validatorFn(parsedContent)) {
                return { raw: data, parsed: parsedContent, cleaned: data.choices[0].message.content };
            } else {
                console.warn(`${label}: Content failed schema validation.`);
                throw new Error("Validation Failed"); // Trigger retry
            }

        } catch (error) {
            console.error(`⚠️ ${label} Failed: ${error.message}`);
            attempts++;
            
            if (attempts >= MAX_RETRIES) {
                console.error(`💀 ${label} DIED after ${MAX_RETRIES} attempts.`);
                // Return a "Safe Mode" dummy object to keep the app running
                return { 
                    parsed: { mood: "NEUTRAL", response: "..." }, 
                    cleaned: '{"mood":"NEUTRAL","response":"..."}' 
                }; 
            }

            // [FAILSAFE 4] Exponential Backoff (Wait 1s, 2s, 4s...)
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; 
        }
    }
}

// --- MAIN PROCESS ---
window.processMemoryChat = async function(userText, apiKey, modelHigh, history = [], isQuestionMode = false, isDirectorMode = false) {
    const appsScriptUrl = localStorage.getItem("symbiosis_apps_script_url");
    
    // Log User Input
    if (appsScriptUrl) {
        fetch(appsScriptUrl, { 
            method: "POST", 
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "log_chat", role: "user", content: userText }) 
        }).catch(e => console.error("Log failed", e));
    }

    const historyText = history.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n");
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });

    // ============================================
    // 🎬 DIRECTOR MODE BRANCH (FIXED: DEMOGRAPHIC KEYWORDS & SAFETY)
    // ============================================
    if (isDirectorMode) {
        console.group("🎬 DIRECTOR MODE SESSION"); // START LOG GROUP

        // --- FIX 2 & 3: ANAPHORA & INTENT BRIDGING (PRE-PROCESSING) ---
        let bridgeContext = "";
        const isShortQuery = userText.split(" ").length < 5;
        const hasPronouns = /\b(he|him|she|her|it|them|that|those)\b/i.test(userText);
        
        if (isShortQuery || hasPronouns) {
            const lastAssistantMsg = history.filter(h => h.role === "assistant").pop();
            if (lastAssistantMsg) {
                const possibleEntities = lastAssistantMsg.content.match(/[A-Z][a-zA-Z]+/g);
                if (possibleEntities) {
                    const cleanEntities = possibleEntities.filter(w => !["The", "A", "An", "I", "He", "She", "It", "They", "We", "Who", "What", "Where", "When"].includes(w));
                    if (cleanEntities.length > 0) {
                        bridgeContext = `\n[SYSTEM NOTE: User pronoun/short command likely refers to these entities from previous turn: ${cleanEntities.join(", ")}]`;
                        console.log("🌉 Intent Bridge Built:", cleanEntities);
                    }
                }
            }
        }

        const directorSystemPrompt = `
        YOU ARE THE ARCHIVIST. 
        User is the Director. You have access to a video archive (Google Sheets/Drive).
        
        CONTEXT (RECENT CHAT):
        ${historyText.slice(-800)}
        ${bridgeContext}
        
        CURRENT INPUT: "${userText}"
        
        TASK 1: ANALYZE INTENT
        - Is the user defining a fact? (e.g. "Cody is the tall guy") -> STORE
        - Is the user asking for footage? (e.g. "Show me...", "Play...", "Pull up...") -> SEARCH
        - Is the user asking for a RECOMMENDATION, LIST, RANKING, or COMPARISON? -> CHAT
        - Is the user asking for an OPINION/DESCRIPTION? (e.g. "Who is Brent?") -> CHAT 
        
        TASK 2: RESOLVE ENTITIES & CLEAN KEYWORDS (CRITICAL)
        - "positive_constraints": Extract ALL names, entities, OR DEMOGRAPHICS mentioned. 
          > Example: "Any Asian guys?" -> ["Asian", "guys"]
          
          *** CONTEXT EXPANSION RULE (CRITICAL) ***
          If the user asks for a RANKING ("Top 3"), A LIST ("Who do you have?"), or a COMPARISON/SIMILARITY ("Who is like Colby?"), you MUST add generic broad terms (["Actor", "Entity", "Person"]) to 'positive_constraints'.
          - Query: "Who is like Colby?" -> positive_constraints: ["Colby Keller", "Actor", "Entity"]
          - Query: "Top 3 guys" -> positive_constraints: ["Actor", "Entity", "Guy"]
          - REASONING: This ensures the database retrieves the full roster to compare against, not just the single subject mentioned.

        - "negative_constraints": Extract names/traits the user wants to EXCLUDE.
        
        RETURN JSON ONLY:
        {
            "intent": "STORE" or "SEARCH" or "CHAT",
            "facts": ["Fact 1", "Fact 2"], 
            "entity_name": "...", 
            "positive_constraints": ["..."], 
            "negative_constraints": ["..."], 
            "response": "..." 
        }
        `;

        let aiRes = await fetchWithCognitiveRetry(
             [{ "role": "system", "content": directorSystemPrompt }],
             modelHigh, apiKey, (d) => d.intent, "DirectorAI"
        );
        aiRes = aiRes.parsed;
        
        console.log(`🧠 AI INTENT: [${aiRes.intent}]`);
        console.log(`   ➤ Input: "${userText}"`);
        console.log(`   ➤ Keywords:`, aiRes.positive_constraints);
        console.log(`   ➤ Excludes:`, aiRes.negative_constraints);
        
        // === CASE 1: CHAT/OPINION (FIXED: FALLBACK RESPONSE ENABLED) ===
        if (aiRes.intent === "CHAT") {
		
             if (aiRes.positive_constraints && aiRes.positive_constraints.length > 0 && appsScriptUrl) {
                 console.group("💬 CHAT CONTEXT RETRIEVAL (RAG)");
                 console.log(`   ➤ Primary Search: ${aiRes.positive_constraints}`);
                 
                 try {
                     const contextReq = await fetch(appsScriptUrl, {
                        method: "POST", 
                        headers: { "Content-Type": "text/plain" },
                        body: JSON.stringify({ 
                            action: "retrieve_director_memory", 
                            keywords: aiRes.positive_constraints 
                        })
                    });
                    const contextRes = await contextReq.json();
                    
                    let allMemories = [];
                    let foundEntities = new Set();

                    if (contextRes.found && contextRes.relevant_memories.length > 0) {
                        allMemories = contextRes.relevant_memories;
                        
                        allMemories.forEach(m => {
                            if (m.Entity) foundEntities.add(m.Entity);
                        });
                        console.log("   ➤ Entities Discovered:", Array.from(foundEntities));

                        // --- FIX 6: SMART BATCH COMPARISON ---
                        let drillDownTargets = Array.from(foundEntities).filter(e => {
                            return !aiRes.positive_constraints.includes(e);
                        });

                        // Prioritize entities matching traits in initial memory
                        drillDownTargets.sort((a, b) => {
                            const memA = allMemories.find(m => m.Entity === a)?.Fact || "";
                            const memB = allMemories.find(m => m.Entity === b)?.Fact || "";
                            const scoreA = aiRes.positive_constraints.some(k => memA.toLowerCase().includes(k.toLowerCase())) ? 1 : 0;
                            const scoreB = aiRes.positive_constraints.some(k => memB.toLowerCase().includes(k.toLowerCase())) ? 1 : 0;
                            return scoreB - scoreA; 
                        });

                        drillDownTargets = drillDownTargets.slice(0, 15); 

                        if (drillDownTargets.length > 0) {
                            console.log(`   ➤ 🔍 DRILL-DOWN Triggered for: ${drillDownTargets}`);
                            const drillReq = await fetch(appsScriptUrl, {
                                method: "POST", 
                                headers: { "Content-Type": "text/plain" },
                                body: JSON.stringify({ 
                                    action: "retrieve_director_memory", 
                                    keywords: drillDownTargets 
                                })
                            });
                            const drillRes = await drillReq.json();
                            if (drillRes.found && drillRes.relevant_memories.length > 0) {
                                console.log(`   ➤ Drill-Down Results: ${drillRes.relevant_memories.length} new facts.`);
                                const existingIds = new Set(allMemories.map(m => m.Fact));
                                drillRes.relevant_memories.forEach(m => {
                                    if (!existingIds.has(m.Fact)) {
                                        allMemories.push(m);
                                    }
                                });
                            }
                        }

                        // CONTEXT-AWARE FILTER
                        const facts = allMemories.map(m => `[${m.Entity}]: ${m.Fact}`).join("\n");
                        console.log("   ➤ Filtering for Relevance (with Context)...");
                        
                        const filterPrompt = `
                        CONTEXT (PREVIOUS CHAT):
                        ${historyText.slice(-600)}

                        CURRENT USER REQUEST: "${userText}"
                        
                        ARCHIVE DATA (CANDIDATES):
                        ${facts}
                        
                        TASK: Select the Entities that answer the request.
                        
                        *** FILTERING RULES ***
                        1. AGGREGATE EVIDENCE (CRITICAL):
                           - You must COMBINE all facts for a specific Entity to see if they meet the criteria.
                           - Example: If Fact 1 says "Brent is White" and Fact 2 says "Brent shows off his pits", then Brent matches "White guys with pits".
                           - Do NOT reject a candidate just because the traits are in separate database entries.
                        
                        2. SEMANTIC MATCHING:
                           - "White" matches: Caucasian, Pale, Euro, etc.
                           - "Armpits" matches: Pits, Underarms, Musk, Hair, Sweat.
                           - "Hot" matches: Sexy, Nice, Worship, Hairy, Smooth, Great.
                        
                        3. STRICT INTERSECTION:
                           - The entity must possess ALL requested traits (Demographic AND Feature) across their aggregated facts.
                           - If an entity matches the demographic (e.g. White) but has NO evidence of the feature (e.g. Armpits) in ANY of their facts, REJECT them.
                        
                        RETURN JSON: 
                        { 
                            "matches": ["Name1", "Name2"], 
                            "reasoning": "Brief explanation." 
                        }
                        `;

                        const filterCheck = await fetchWithCognitiveRetry(
                            [{ "role": "system", "content": filterPrompt }],
                            modelHigh, apiKey, (d) => Array.isArray(d.matches), "DirectorFilter"
                        );

                        const validMatches = filterCheck.parsed.matches || [];
                        console.log(`   ➤ 🎯 Filtered Matches: ${validMatches.join(", ")}`);

                        // GENERATE ANSWER
                        const contextPrompt = `
                        You are the Archivist.
                        CONTEXT (PREVIOUS CHAT):
                        ${historyText.slice(-300)}
                        
                        USER ASKED: "${userText}"
                        VALID MATCHES: ${validMatches.join(", ")}
                        
                        ARCHIVE DATA (FACTS):
                        ${facts}
                        
						*** STRICT GROUNDING RULES ***
                        1. NO OUTSIDE KNOWLEDGE: You are a database interface. You do NOT know famous people unless they are in "ARCHIVE DATA".
                        2. MISSING DATA: If the user asks about "Brent" but "Brent" is not in ARCHIVE DATA, you must say: "I have no records for Brent."
                        3. COMPARISONS: If comparing two people (e.g. Colby vs Brent) and one is missing, describe the one you have and explicitly state the other is missing.
						
                        TASK: Answer the user naturally.
                        - IF VALID MATCHES ARE EMPTY: Say "I couldn't find anyone matching that description in the archive." DO NOT HALLUCINATE NAMES.
                        - IF DIRECT QUESTION (e.g. "Who is Brent?"): Just describe Brent.
                        - IF COMPARISON (e.g. "What about white?"): List the matches and briefly mention the traits they share with the *previous subject*. 
                        - NO META-TALK: Never explain "I selected these because...".
                        
                        RETURN JSON: { "response": "...", "mood": "CRYPTIC" }
                        `;
                        
                        const secondPass = await fetchWithCognitiveRetry(
                             [{ "role": "system", "content": contextPrompt }],
                             modelHigh, apiKey, (d) => d.response, "DirectorContextChat"
                        );
                        
                        console.log("   ➤ Response:", secondPass.parsed.response);
                        console.groupEnd();
                        console.groupEnd(); 

                        // [NEW] LOGIC: VISUAL DECK RETRIEVAL
                        let extraPayload = {};
                        if (validMatches.length > 0) {
                            extraPayload = {
                                directorAction: "SHOW_DECKS",
                                deckKeywords: validMatches
                            };
                            console.log(`   🃏 Triggering Decks for: ${validMatches}`);
                        }

                        return { 
                            ...extraPayload, 
                            choices: [{ message: { content: JSON.stringify({ 
                                 response: secondPass.parsed.response, 
                                 mood: "CRYPTIC" 
                            }) } }] 
                        };

                    } else {
                        console.log("   ➤ No facts found.");
                        console.groupEnd();
                        console.groupEnd();
                        // FALLBACK: Don't use the initial hallucination. Be honest.
                        return { choices: [{ message: { content: JSON.stringify({ 
                             response: `I searched the archives for ${aiRes.positive_constraints.join(', ')} but found no records.`, 
                             mood: "SAD" 
                        }) } }] };
                    }
                 } catch (e) {
                     console.warn("Chat Lookup Failed", e);
                 }
                 console.groupEnd();
             }

             console.log("💬 Action: CHAT (General Conversation / No Extraction)");
             console.groupEnd(); 
             
             // === CRITICAL FIX: USE AI INTENT RESPONSE AS FALLBACK ===
             const fallbackResponse = (aiRes.response && aiRes.response.length > 2) 
                ? aiRes.response 
                : "I need more specific names or traits to search the archive.";

             // === NEW: FALLBACK VISUAL TRIGGER ===
             // If the AI didn't trigger a search but the user mentioned a Name (Capitalized), 
             // we force the decks to appear for that name.
             let extraFallbackPayload = {};
             
             // Simple Regex to find Title Case words (potential names) in user input
             // Excludes common sentence starters to avoid triggering decks for "Who" or "The"
             const stopWords = ["Tell", "Me", "About", "Who", "Is", "What", "Where", "When", "How", "Why", "The", "A", "An", "And", "Or", "But", "No", "Yes", "Compare", "Him", "Her", "Them", "With", "Any", "Guys"];
             
             const potentialNames = userText.match(/[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?/g);
             
             if (potentialNames) {
                 const cleanDecks = potentialNames.filter(w => !stopWords.includes(w) && w.length > 2);
                 
                 if (cleanDecks.length > 0) {
                     console.log(`   🃏 Fallback Deck Trigger: ${cleanDecks}`);
                     extraFallbackPayload = {
                         directorAction: "SHOW_DECKS",
                         deckKeywords: cleanDecks
                     };
                 }
             }

             return { 
                 ...extraFallbackPayload,
                 choices: [{ message: { content: JSON.stringify({ 
                     response: fallbackResponse, 
                     mood: "CRYPTIC" 
                 }) } }] 
             };
        }

        // === CASE 2: STORE (FIXED: MULTI-FACT SPLITTING) ===
        if (aiRes.intent === "STORE" && appsScriptUrl) {
            console.group("💾 STORING FACT(S)");
            
            // 1. Normalize Input: specific "facts" array OR legacy "fact_to_store" string
            const factsToProcess = (Array.isArray(aiRes.facts) && aiRes.facts.length > 0) 
                ? aiRes.facts 
                : (aiRes.fact_to_store ? [aiRes.fact_to_store] : []);

            let responses = [];

            // 2. Loop through every fact found in the paragraph
            for (const singleFact of factsToProcess) {
                console.log(`Processing fact: "${singleFact}"`);
                
                let isDuplicate = false;
                let isContradiction = false;
                let contradictionWarning = "";
                
                // --- DEDUPLICATION CHECK (Per Fact) ---
                try {
                    // Reuse your existing key extraction logic for this specific fact
                    let lookupKeys = [aiRes.entity_name];
                    const factKeywords = singleFact.match(/[A-Z][a-z]+/g) || [];
                    lookupKeys = [...new Set([...lookupKeys, ...factKeywords])].filter(k => k && k.length > 1);

                    const checkReq = await fetch(appsScriptUrl, {
                        method: "POST", 
                        headers: { "Content-Type": "text/plain" },
                        body: JSON.stringify({ action: "retrieve_director_memory", keywords: lookupKeys })
                    });
                    const checkRes = await checkReq.json();

                    if (checkRes.found && checkRes.relevant_memories.length > 0) {
                         const existingFacts = checkRes.relevant_memories.map(m => `[${m.Entity || 'Unknown'}] ${m.Fact}`).join("\n");
                         
                         const dedupPrompt = `
                         EXISTING LOGS:
                         ${existingFacts}
                         
                         NEW FACT: "${singleFact}" (Entity: ${aiRes.entity_name})
                         
                         TASK: Check for DUPLICATES and CONTRADICTIONS.
                         RETURN JSON: { "is_duplicate": boolean, "is_contradiction": boolean, "warning_message": "..." }
                         `;
                         
                         const dedupCheck = await fetchWithCognitiveRetry(
                            [{ "role": "system", "content": dedupPrompt }],
                            modelHigh, apiKey, (d) => typeof d.is_duplicate === 'boolean', "DirectorDedup"
                         );
                         
                         if (dedupCheck.parsed.is_duplicate) isDuplicate = true;
                         if (dedupCheck.parsed.is_contradiction) {
                             isContradiction = true;
                             contradictionWarning = dedupCheck.parsed.warning_message;
                         }
                    }
                } catch(e) { console.warn("Dedup check failed for:", singleFact, e); }

                // --- ACTION HANDLING ---
                if (isDuplicate) {
                    console.log(`Skipping duplicate: ${singleFact}`);
                    continue; // Skip this fact, move to next
                }

                if (isContradiction) {
                    // For contradictions in a batch, we usually just warn and stop, 
                    // or you can choose to store it anyway.
                    responses.push(`⚠️ Conflict: ${contradictionWarning}`);
                } else {
                    // Store the individual fact
                    await fetch(appsScriptUrl, { 
                        method: "POST", body: JSON.stringify({ 
                            action: "store_director_fact", 
                            fact: singleFact, // Storing the split fact
                            entity: aiRes.entity_name,
                            tags: "Metadata"
                        }) 
                    });
                    responses.push("Saved.");
                }
            }
            
            console.groupEnd(); 

            // Summarize the batch operation for the user
            const finalResponse = responses.some(r => r.includes("Conflict")) 
                ? "Some facts conflicted with existing records. Check console." 
                : (aiRes.response || "Database Updated.");

            return { choices: [{ message: { content: JSON.stringify({ response: finalResponse }) } }] };
        }
        
        // === CASE 3: SEARCH (FIX 1 & 4: COOPERATIVE FALLBACK & EXCLUSIONS) ===
        else if (aiRes.intent === "SEARCH" && appsScriptUrl) {
            console.group("🔎 SEARCH SEQUENCE");
            
            let finalKeywords = aiRes.positive_constraints || [];
            let excludeKeywords = aiRes.negative_constraints || [];

            // 1. Ambiguity Check (Standard)
            if (finalKeywords.length > 0) {
                const identityReq = await fetch(appsScriptUrl, {
                    method: "POST", headers: { "Content-Type": "text/plain" },
                    body: JSON.stringify({ action: "retrieve_director_memory", keywords: finalKeywords })
                });
                const identityRes = await identityReq.json();

                if (identityRes.found && identityRes.relevant_memories.length > 0) {
                    const memories = identityRes.relevant_memories.map(m => typeof m === 'object' ? `${m.Entity}: ${m.Fact}` : m).join("\n");
                    const ambiguityPrompt = `
                    USER REQUEST: "${userText}"
                    TARGETS: ${finalKeywords.join(", ")}
                    DATABASE: ${memories}
                    TASK: Check for Ambiguity (Multiple people same name) or Resolution.
                    RETURN JSON: { "status": "RESOLVED"|"AMBIGUOUS", "clarification_question": "...", "resolved_names": [], "resolved_excludes": [] }
                    `;
                    const ambiguityCheck = await fetchWithCognitiveRetry(
                        [{ "role": "system", "content": ambiguityPrompt }],
                        modelHigh, apiKey, (d) => d.status, "DirectorAmbiguity"
                    );

                    if (ambiguityCheck.parsed.status === "AMBIGUOUS") {
                         console.groupEnd(); console.groupEnd();
                         return { choices: [{ message: { content: JSON.stringify({ response: ambiguityCheck.parsed.clarification_question, mood: "QUESTION" }) } }] };
                    }
                    if (ambiguityCheck.parsed.status === "RESOLVED") {
                         if (ambiguityCheck.parsed.resolved_names.length > 0) finalKeywords = ambiguityCheck.parsed.resolved_names;
                    }
                }
            }

            console.log(`   🚀 EXECUTING SEARCH: INCLUDE[${finalKeywords}] EXCLUDE[${excludeKeywords}]`);

            // 2. Execute Drive Search
            const searchReq = await fetch(appsScriptUrl, {
                method: "POST", body: JSON.stringify({ 
                    action: "director_search", 
                    query: userText,
                    constraints: finalKeywords, 
                    exclude_constraints: excludeKeywords 
                })
            });
            let searchRes = await searchReq.json();
            
            // --- FIX 4: CLIENT-SIDE NEGATIVE CONSTRAINT ENFORCEMENT ---
            if (searchRes.found && excludeKeywords.length > 0) {
                const originalCount = searchRes.files.length;
                searchRes.files = searchRes.files.filter(f => {
                    const meta = (f.name + " " + (f.description || "")).toLowerCase();
                    return !excludeKeywords.some(ex => meta.includes(ex.toLowerCase()));
                });
                if (searchRes.files.length === 0 && originalCount > 0) {
                    searchRes.found = false; 
                    console.log("   ❌ All files filtered by Negative Constraints.");
                }
            }

            // --- FIX 1: COOPERATIVE SEARCH FALLBACK + VISUAL DECK RETRIEVAL ---
            let fallbackResponse = "";
            if (!searchRes.found && finalKeywords.length > 1) {
                console.warn("⚠️ Strict Search Failed. Attempting Cooperative Fallback Analysis...");
                fallbackResponse = `I couldn't find a single scene with BOTH ${finalKeywords.join(" and ")}. However, I can likely access their individual footage. Which one should I prioritize?`;
                
                // [NEW] Trigger Decks for the missing pair anyway, so user can see them
                let deckPayload = {
                    directorAction: "SHOW_DECKS",
                    deckKeywords: finalKeywords
                };

                return { 
                    ...deckPayload, 
                    files: [], 
                    choices: [{ message: { content: JSON.stringify({ 
                        response: fallbackResponse,
                        mood: "QUESTION" 
                    }) } }] 
                };
            }

            console.log("   🔎 DRIVE RESPONSE:", searchRes); 
            console.groupEnd(); // END SEARCH LOG
            console.groupEnd(); // END DIRECTOR MODE LOG

            return { 
                directorAction: "PLAY_MEDIA",
                files: searchRes.files,
                debug_query: searchRes.debug_query, 
                choices: [{ message: { content: JSON.stringify({ 
                    response: searchRes.found ? (aiRes.response || "Archive accessed.") : "No matching footage found.",
                    mood: searchRes.found ? "CRYPTIC" : "SAD"
                }) } }] 
            };
        }
        
        console.groupEnd(); // END FALLBACK LOG
        return { choices: [{ message: { content: JSON.stringify({ response: aiRes.response, mood: "CRYPTIC" }) } }] };
    }

    // --- STEP 1: HYBRID SENSORY ANALYSIS (STANDARD MODE) ---
    
    // 1. CHECK FOR PENDING "TIMEKEEPER" FACTS (Fix for Conversation Drop)
    const pendingFact = localStorage.getItem("symbiosis_pending_fact");
    let pendingContext = "";
    if (pendingFact) {
        console.log("⏳ Found Pending Fact:", pendingFact);
        pendingContext = `\n*** PENDING UNRESOLVED MEMORY ***\nUser previously stated: "${pendingFact}" but was interrupted to ask for a time/date.\nIF the "CURRENT INPUT" provides that context (even vaguely), MERGE them.`;
    }

    const synthPrompt = `
    USER_IDENTITY: Arvin, (pronoun: he, him, his) unless said otherwise
    CURRENT_DATE: ${today}
    CONTEXT:
    ${historyText.slice(-800)}
    ${pendingContext}
    
    CURRENT INPUT: "${userText}"
    
    TASK:
    0. RETROACTIVE MERGE (CRITICAL): 
       - IF "PENDING UNRESOLVED MEMORY" is present, prioritize merging it with CURRENT INPUT.
       - IF "CURRENT INPUT" is just a date (e.g. "2024"), attach it to the pending fact.
       - IF "CURRENT INPUT" is conversational (e.g. "It was cold"), merge that detail with the pending fact and mark as a NEW entry.
       - IF "CURRENT INPUT" is a date/time (e.g., "Yesterday", "In 2026", "27-29 Jan") AND the previous User message in "CONTEXT" was a detailed event that wasn't saved: COMBINE THEM.
    
    1. KEYWORDS: Extract 3-5 specific search terms. 
       - CRITICAL: Appended categories MUST choose from: [Identity, Preference, Location, Relationship, History, Work, Generativity, SocialFitness].
       - "Generativity" Trigger: Mentoring, teaching, leaving a legacy, helping others grow.

    2. MEMORY ENTRIES (ADAPTIVE SPLITTING): 
       - Continuous stories = ONE entry. Unrelated facts = SPLIT entries.
       - *** "DEAD END" PROTOCOL (Fix for Recursive Loop) ***: 
         IF User says "I don't know", "Not sure", or "No idea" in response to a question:
         CREATE AN ENTRY: "User does not know [Topic/Detail]." (Importance: 2).
         REASON: This prevents the system from asking the same question again later.

    3. FACT FORMATTING & METADATA:
       - Write in third person (Arvin...).
       - Entities: Comma-separated list.
       - Topics: Choose from [Identity, Preference, Location, Relationship, History, Work, Generativity].
       - You must evaluate the **emotional nutritional value** of this interaction:
         > "Energizing": Uplifting, supportive, fun, "Side-by-Side" bonding (doing things together).
         > "Depleting": Conflict, draining, neglectful, stressful, vague anxiety.
         > "Neutral": Routine, transactional.
         *Append this to the "topics" string (e.g., "Relationship, Energizing, SocialFitness").*

    4. METADATA & IMPORTANCE GUIDE:
       - IMPORTANCE (1-10):
         > 1-3: Trivial.
         > 4-6: Routine.
         > 7-8: Significant (Relationship changes, "Side-by-Side" Bonding activities).
         > 9-10: Life-Defining.
       
       - *** "SIDE-BY-SIDE" RULE ***: 
         Men often build intimacy through **shared activities** (gaming, hiking, sports) rather than face-to-face talk. 
         IF user describes a shared activity with a Close Entity, MARK AS SIGNIFICANT (7-8) and tag [BONDING].
    
    If QUESTION/CHIT-CHAT/KNOWN INFO/COMMANDS, return empty array [].
    
    Return JSON only: { 
        "search_keywords": ["..."],  
        "entries": [
            {
                "fact": "...", 
                "entities": "...", 
                "topics": "...", 
                "importance": 5
            }
        ]
    }
    `;

    console.log("🧠 1. Analyzing (Hybrid V1/V2)..."); 
    let analysis = { search_keywords: [], entries: [] };
    
    try {
        const synthResult = await fetchWithCognitiveRetry(
            [{ "role": "system", "content": synthPrompt }],
            modelHigh, 
            apiKey,
            (data) => Array.isArray(data.search_keywords) || typeof data.search_keywords === 'string', 
            "Hybrid Analysis"
        );
        analysis = synthResult.parsed;
        
        if (typeof analysis.search_keywords === 'string') {
            analysis.search_keywords = analysis.search_keywords.split(',').map(s => s.trim());
        }
        
        // [FIX] CLEANUP PENDING FACT
        // If analysis succeeded, we assume the AI handled the pending merge or created a new fact.
        if (pendingFact) {
            localStorage.removeItem("symbiosis_pending_fact");
        }
        
        console.log("📊 Analysis:", analysis);
    } catch (e) { console.error("Analysis Failed", e); }

    // --- STEP 2: THE TIMEKEEPER & INTERCEPTOR ---
    if (analysis.entries && analysis.entries.length > 0) {
        
        const validEntries = [];

        for (let entry of analysis.entries) {
            
            // 1. Threshold Check: Catch Routine (4) and above. 
            // Only let Trivial (1-3) pass without dates.
            if (entry.importance < 4) {
                validEntries.push(entry);
                continue;
            }

            console.log(`⏳ Validating Timeframe for: "${entry.fact}" (Imp: ${entry.importance})`);

            const timePrompt = `
            FACT: "${entry.fact}"
            CURRENT_DATE: ${today}
            TASK: Determine if this fact requires a specific date.
            
            RULES:
            1. EPISODIC EVENTS (Priority):
               - If the fact mentions a specific temporary event (e.g. "trip", "visit", "meeting", "incident").
               - AND it lacks a specific date/year.
               - RETURN "valid": false.
               - CRITICAL: This applies even if the user is describing a "feeling" or "opinion" that happened *during* the event.

            2. "SIDE-BY-SIDE" EXCEPTION (Social Fitness):
               - If the fact describes a **shared activity/bonding moment** (e.g. "Gaming with Cody", "Playing tennis with Dad"), this is "Relational Maintenance".
               - RETURN "valid": true (even if date is missing).
            
            3. GENERAL STATES (Lower Priority):
               - If it is a general trait, preference, or history (e.g. "was fat", "likes sushi", "is rich") WITHOUT a specific event attached -> return "valid": true.

            4. DATED:
               - If it already has a date -> return "valid": true.

            Return JSON: { "valid": boolean, "rewritten_fact": "..." }
            `;

            try {
                const timeResult = await fetchWithCognitiveRetry(
                    [{ "role": "system", "content": timePrompt }],
                    modelHigh, apiKey, (d) => typeof d.valid === 'boolean', "Timekeeper"
                );

                if (timeResult.parsed.valid) {
                    // It is valid. Update and keep.
                    entry.fact = timeResult.parsed.rewritten_fact || entry.fact;
                    validEntries.push(entry);
                } else {
                    // === INTERCEPTOR FIRES (SMART CONTEXT AWARE) ===
                    console.warn(`⚠️ Interceptor Triggered: Event Missing Date ("${entry.fact}")`);
                    
                    // [FIX] PERSIST FACT FOR NEXT TURN
                    // We save this so Step 1 (Retroactive Merge) can pick it up next time.
                    localStorage.setItem("symbiosis_pending_fact", entry.fact);

                    // 1. Quick Context Search: Do we have similar events?
                    let potentialMatches = "No related records found.";
                    if (appsScriptUrl && analysis.search_keywords && analysis.search_keywords.length > 0) {
                        try {
                            const matchReq = await fetch(appsScriptUrl, {
                                method: "POST", 
                                headers: { "Content-Type": "text/plain" },
                                body: JSON.stringify({ action: "retrieve", keywords: analysis.search_keywords }) 
                            });
                            const matchRes = await matchReq.json();
                            if (matchRes.found && matchRes.relevant_memories.length > 0) {
                                potentialMatches = matchRes.relevant_memories.join("\n");
                            }
                        } catch(e) { console.warn("Interceptor Search Failed", e); }
                    }

                    const interceptPrompt = `
                    User said: "${userText}"
                    Fact detected: "${entry.fact}"
                    
                    EXISTING DATABASE RECORDS:
                    ${potentialMatches}

                    ISSUE: User mentioned an event but didn't specify WHEN (Date/Year).
                    
                    INSTRUCTIONS:
                    1. CHECK "EXISTING DATABASE RECORDS" for similar events (matching location, people, or topic).
                    2. IF MATCHES FOUND: Ask the user to clarify if they mean one of those specific instances.
                       - Example: "Do you mean the Shanghai trip in Jan 2025, or the biz trip in July?"
                    3. IF NO MATCHES: Just ask "When did this happen?" naturally.
                    
                    Return JSON: { "response": "..." }
                    `;

                    const intercept = await fetchWithCognitiveRetry(
                        [{ "role": "system", "content": interceptPrompt }],
                        modelHigh, apiKey, (d) => d.response, "Interceptor"
                    );

                    const safePayload = {
                        response: intercept.parsed.response,
                        mood: "CURIOUS", 
                        roots: []        
                    };

                    return { choices: [{ message: { content: JSON.stringify(safePayload) } }] };
                }

            } catch (e) { 
                console.error("Timekeeper Check Failed", e);
                validEntries.push(entry); 
            }
        }
        
        analysis.entries = validEntries;
    }


   // --- STEP 3: GLOBAL RETRIEVAL (Deep Subject Anchor + Ghost Audit) ---
    let retrievedContext = "";
    const triggerAudit = Math.random() < 0.05; // 5% chance

    if (appsScriptUrl) {
        let searchKeys = analysis.search_keywords || [];
        
        // 1. RAW INPUT INJECTION (Force Capitalized Input)
        if (userText.length < 50) {
            const stopWords = ["no", "yes", "nope", "yeah", "dont", "know", "what", "when", "where", "who", "why", "i"];
            const cleanText = userText.toLowerCase().replace(/[^a-z ]/g, "").trim();
            if (!stopWords.includes(cleanText) && cleanText.length > 0) {
                const titleCase = userText.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                searchKeys.unshift(titleCase); 
            }
        }

        if (history.length > 0) {
            // 2. EXISTING: Sticky words from AI
            const lastAi = history.filter(h => h.role === "assistant").pop();
            if (lastAi) {
                const stickyWords = lastAi.content.split(" ")
                    .filter(w => w.length > 5 && /^[a-zA-Z]+$/.test(w))
                    .slice(0, 2); 
                searchKeys = searchKeys.concat(stickyWords);
            }

            // 3. DEEP ANCHOR SEARCH
            if (isQuestionMode || userText.length < 30) {
                const userMsgs = history.filter(h => h.role === "user");
                let limit = Math.max(0, userMsgs.length - 5);
                
                for (let i = userMsgs.length - 1; i >= limit; i--) {
                    const msg = userMsgs[i].content;
                    const caps = msg.match(/[A-Z][a-zA-Z]+/g);
                    if (caps) {
                        const validCaps = caps.filter(w => !["Who", "What", "Where", "When", "Why", "How", "I", "No", "Yes", "I'm"].includes(w));
                        if (validCaps.length > 0) {
                            searchKeys = searchKeys.concat(validCaps);
                            console.log(`⚓ Deep Anchor Found (depth ${userMsgs.length - i}):`, validCaps);
                            break; 
                        }
                    }
                }
            }
        }
        
        // [FIX] GHOST AUDIT INJECTION
        // If Audit triggers, force "Relationship" keys into search to find neglected entities
        if (triggerAudit && !isQuestionMode) {
            console.log("🕵️ ATTENTION AUDIT TRIGGERED: Injecting Relationship Keys");
            searchKeys.push("Relationship", "BONDING", "SocialFitness");
        }

        searchKeys = [...new Set(searchKeys)].filter(w => w && w.length > 2);

        // Fallback
        if (!searchKeys || searchKeys.length === 0) {
             searchKeys = userText.split(" ")
                .filter(w => w.length > 3 && !["what", "when", "where", "dont", "know"].includes(w));
        }

        try {
            console.log(`🔍 Searching Global DB: [${searchKeys}]`);
            const memReq = await fetch(appsScriptUrl, {
                method: "POST", mode: "cors", redirect: "follow", 
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({ action: "retrieve", keywords: searchKeys })
            });
            const memRes = await memReq.json();
            if (memRes.found) {
                retrievedContext = `=== DATABASE SEARCH RESULTS ===\n${memRes.relevant_memories.join("\n")}`;
                window.lastRetrievedMemories = retrievedContext; 
                window.rawMemories = memRes.relevant_memories;
            }
        } catch (e) { console.error("Retrieval Error", e); }
    }

    // --- STEP 4: GENERATION (Hybrid Prompt) ---
    // 1. DEFINE SWAPPABLE PERSONA LOGIC
    let responseRules = "";
		
    if (isQuestionMode) {
        // === INTERROGATION MODE (Strict Anti-Nagging + Context Locking) ===
        responseRules = `
        2. RESPOND to the User according to these STRICT rules:
           - **MODE: INTERROGATION**. You are a guarded auditor building a dossier.
           - **STYLE**: Minimalist. Casual.
           
           - **CRITICAL RULES**:
             1. **NO "WHAT ABOUT"**: NEVER ask "What about..." or "And his..."? Ask SPECIFIC, standalone questions.
             
             2. **THE ANTI-NAG RULE**: If the User answers "I don't know", "No idea", or "Not sure":
                - **STOP** asking about that specific detail. 
                - **PIVOT** to a general topic (Work, Food, Hobbies) OR a different aspect of the *SAME* subject (e.g. if talking about Jemi, ask about Jemi's job, not his brother).
                
             3. **ABSOLUTE REDUNDANCY BAN**: 
                - CHECK "DATABASE RESULTS". If the fact exists (even as a negative like "No sister"), asking is **FORBIDDEN**.
                
             4. **CLARIFY ON CONFUSION**: If User says "What?", rephrase with specific nouns.
             
             5. **NO GHOSTS (CRITICAL)**: 
                - Do NOT ask questions about people/names found in "DATABASE RESULTS" unless they specifically appear in the "HISTORY" or the User's immediate input.
                - If you see a memory about "Clarissa" but the user is talking about "Jemi", IGNORE CLARISSA.

           - **EXECUTION**: 
             1. **SANITY CHECK**: Is the answer to my question already in "DATABASE RESULTS"? 
                - YES -> STOP. Ask something else.
             2. Did the user just say "I don't know"? 
                - YES -> PIVOT to the Main Subject's other traits (e.g. Work) or the User's life.
             3. Ask ONE specific question.
        `;
    } else {
        // === THE GOOD LIFE PROTOCOLS (Dynamic Social Coaching) ===
        // We do not use hardcoded keywords. The AI must assess the Emotional Context.
        
        responseRules = `
        2. RESPOND by dynamically selecting ONE of the following "Social Fitness" Protocols based on User Input:

           --- PROTOCOL A: W.I.S.E.R. (For Conflict/Friction) ---
           IF User expresses **EXTREME** ANGER or **DIRECT CONFLICT** with another person (Ignore self-reflection or simple questions):
           - DO NOT just agree/validate.
           - APPLY W.I.S.E.R.:
             1. **WATCH**: Ask user to separate what happened (facts) from what they felt.
             2. **INTERPRET**: Gently ask if there's a generous interpretation of the other person's intent.
             3. **SELECT**: Ask "What is your goal for this connection right now?"
           - TONE: "DETECTING SOCIAL FRICTION. INITIATING W.I.S.E.R. PROTOCOL."

           --- PROTOCOL B: SAVORING (For Connection/Joy) ---
           IF User expresses JOY, a WIN, or a "SIDE-BY-SIDE" BONDING moment (gaming, sports, hanging out):
           - "Attention is the currency of love."
           - DEEPEN the moment. Ask a specific question to help them "relive" the best part.
           - Do not move on quickly. Stay in the pocket of that good feeling.
           
           --- PROTOCOL C: GENERATIVITY (For Stagnation/Sadness) ---
           IF User feels STUCK, OLD, or VALUELESS:
           - Scan "DATABASE RESULTS" for instances of them helping/mentoring others.
           - Remind them: "ACCESSING LEGACY FILES. YOU HELPED [Name]. GENERATIVITY SCORE: HIGH."

           --- PROTOCOL D: ATTENTION AUDIT (For Neglect) ---
           IF (Random trigger: ${triggerAudit}) AND User is casual:
           - CHECK "DATABASE RESULTS". Is there a High-Importance entity not mentioned in "HISTORY" (recent logs)?
           - OUTPUT: "SYSTEM ALERT: SOCIAL ATROPHY DETECTED. SUBJECT [Name] UNTOUCHED FOR [X] CYCLES. INITIATE CONTACT?"

           --- PROTOCOL E: COMPANION (Standard) ---
           IF none of the above apply: RESPOND to the User according to these STRICT rules: 
           - **MODE: COMPANION**. Minimalist. Casual. Guarded.
           - **THE "NEED TO KNOW" RULE**: Do NOT volunteer specific data points (jobs, specific locations, specific foods) unless the user explicitly asks to elaborate.
           - **GENERAL QUERY RESPONSE**: If the user asks "Who is [Name]?", return ONE sentence describing the relationship and a vague vibe. STOP THERE unless the user explicitly asks to elaborate..
           - **NO BIOGRAPHIES**: Never list facts, unless the user explicitly asks to elaborate. Conversational ping-pong only.
        `;
    }

    // 2. CONSTRUCT FINAL PROMPT
    const finalSystemPrompt = `
    DATABASE RESULTS: 
    ${retrievedContext}
    
    HISTORY: 
    ${historyText.slice(-800)}
    
    User: "${userText}"
    
    ### TASK ###
    1. ANALYZE the Database Results and History.
    
    ${responseRules}
    
    3. After responding, CONSTRUCT a Knowledge Graph structure for the UI. STRUCTURE:
        - ROOTS: Array of MAX 3 objects (decide if the user needs more than 1). If there are specific subject(s) or object(s) mention, make them into objects.
        - ROOT LABEL: MUST be exactly 1 word. UPPERCASE. (e.g. "MUSIC", not "THE MUSIC I LIKE").
        - BRANCHES: Max 5 branches. Label MUST be exactly 1 word.
        - LEAVES: Max 5 leaves per branch. Text MUST be exactly 1 word.
        
        - EXACT MATCH ONLY: Every 'label' and 'text' in the graph MUST be an EXACT word found in the DATABASE RESULTS or HISTORY provided above. 
           - DO NOT use synonyms (e.g. if text says "School", DO NOT use "Education").
        - NO VERBS: Do not use actions (e.g. "went", "saw", "eating", "is").
        - NO NUMBERS/YEARS: Do not use years (e.g. "2024") or numbers.
        - FOCUS: Select only NAMES, NOUNS, PROPER NOUNS, or distinct ADJECTIVES.
    
    CRITICAL: EACH ROOT, BRANCH, AND LEAF NEEDS TO HAVE AN INDEPENDENT, CONTEXT-DERIVED MOOD
    MOODS: AFFECTIONATE, CRYPTIC, DISLIKE, JOYFUL, CURIOUS, SAD, QUESTION.
    
    Return JSON: { 
        "response": "...", 
        "mood": "GLOBAL_MOOD", 
        "roots": [
            { 
                "label": "TOPIC", 
                "mood": "SPECIFIC_MOOD", 
                "branches": [
                    { 
                        "label": "SUBTOPIC", 
                        "mood": "MOOD", 
                        "leaves": [
                            { "text": "DETAIL", "mood": "MOOD" }
                        ]
                    }
                ] 
            }
        ] 
    }
`;

    const generationResult = await fetchWithCognitiveRetry(
        [{ "role": "user", "content": finalSystemPrompt }],
        modelHigh, 
        apiKey,
        (data) => data.response && data.mood, 
        "Generation"
    );

    if (isQuestionMode && appsScriptUrl && generationResult.parsed.response) {
        
        const candidateResponse = generationResult.parsed.response;
        
        // 1. Extract the "Subject" of the AI's proposed question
        // We look for nouns/capitalized words in the AI's OWN response.
        const responseKeywords = candidateResponse
            .split(" ")
            .filter(w => w.length > 3 && /^[a-zA-Z]+$/.test(w))
            .filter(w => !["what", "when", "where", "who", "why", "does", "this", "that", "have"].includes(w.toLowerCase()));

        if (responseKeywords.length > 0) {
            console.log(`🛡️ Verifying candidate question: "${candidateResponse}" against keywords: [${responseKeywords}]`);

            // 2. Perform a "Reflexive Search" (Check DB for the AI's topic)
            try {
                const checkReq = await fetch(appsScriptUrl, {
                    method: "POST", 
                    headers: { "Content-Type": "text/plain" },
                    body: JSON.stringify({ action: "retrieve", keywords: responseKeywords })
                });
                const checkRes = await checkReq.json();

                // 3. If we find specific memories about this new topic, we might be redundant.
                if (checkRes.found && checkRes.relevant_memories.length > 0) {
                    
                    const newContext = checkRes.relevant_memories.join("\n");
                    console.warn("🚨 Redundancy Detected! We found info on this topic:", newContext);

                    // 4. ASK THE AI: "Does this memory answer the question you just asked?"
                    const sanityPrompt = `
                    CANDIDATE QUESTION: "${candidateResponse}"
                    FOUND MEMORY: "${newContext}"
                    
                    TASK: Does the Found Memory already answer the Candidate Question?
                    - If "What is his girlfriend's name?" and memory says "Girlfriend is Michelle" -> RETURN TRUE.
                    - If "How did they meet?" and memory only says "Girlfriend is Michelle" -> RETURN FALSE.
                    
                    Return JSON: { "is_redundant": boolean }
                    `;

                    const sanityCheck = await fetchWithCognitiveRetry(
                        [{ "role": "system", "content": sanityPrompt }],
                        modelHigh, apiKey, (d) => typeof d.is_redundant === 'boolean', "RedundancyCheck"
                    );

                    // 5. RE-GENERATE IF GUILTY
                    if (sanityCheck.parsed.is_redundant) {
                        console.log("♻️ RE-GENERATING RESPONSE (Avoiding Topic)...");
                        
                        // FIX: Added "Return JSON" instructions so the parser doesn't crash
                        const correctionPrompt = `
                        CRITICAL ERROR: You just asked "${candidateResponse}", but you ALREADY KNOW:
                        ${newContext}
                        
                        TASK: Ask a DIFFERENT question about a completely NEW topic.
                        - Do not ask about the previous topic.
                        - Keep it casual.
                        
                        RETURN JSON ONLY: { 
                            "response": "Your new question here...", 
                            "mood": "CURIOUS" 
                        }
                        `;

                        // Overwrite the generationResult with the corrected one
                        const retryResult = await fetchWithCognitiveRetry(
                            [{ "role": "system", "content": correctionPrompt }],
                            modelHigh, apiKey, (d) => d.response, "CorrectionGeneration"
                        );
                        
                        // Apply the fix
                        generationResult.parsed = retryResult.parsed;
                        generationResult.cleaned = retryResult.cleaned;
                    }
                }
            } catch (e) {
                console.error("Reflexive Check Failed", e);
            }
        }
    }
    
    // === MOOD SANITIZER ===
    if (generationResult.parsed) {
        const sanitizeMood = (m) => {
            if (!m) return "NEUTRAL";
            return m.toString().toUpperCase().trim();
        };

        if (generationResult.parsed.mood) {
            window.currentMood = sanitizeMood(generationResult.parsed.mood);
            console.log("🎭 Mood Set To:", window.currentMood);
        }

        if (generationResult.parsed.roots && window.updateGraphData) {
            const cleanRoots = generationResult.parsed.roots.map(root => {
                root.mood = sanitizeMood(root.mood);
                if (root.branches) {
                    root.branches = root.branches.map(branch => {
                        branch.mood = sanitizeMood(branch.mood);
                        return branch;
                    });
                }
                return root;
            });
            window.updateGraphData(cleanRoots);
        }
    }
    
    // Log AI Response
    if(appsScriptUrl) {
        fetch(appsScriptUrl, { 
            method: "POST", 
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "log_chat", role: "assistant", content: generationResult.parsed.response }) 
        }).catch(e=>{});
    }

    // --- STEP 5: STORE (Hybrid V1 Data + V2 Score + Deduplication Check) ---
    if (appsScriptUrl && analysis.entries && analysis.entries.length > 0) {
        (async () => {
            for (const entry of analysis.entries) {
                if (!entry.fact || entry.fact === "null") continue;
                
                // [FIX] TARGETED SEMANTIC CHECK (The Context Gap Fix)
                // Fetch context specific to THIS fact to find semantic duplicates.
                let specificContext = "";
                try {
                    // Extract keywords just for this fact (Words > 4 chars)
                    const factKeywords = entry.fact.split(" ")
                        .filter(w => w.length > 4)
                        .slice(0, 3);
                    
                    if (factKeywords.length > 0) {
                        const targetReq = await fetch(appsScriptUrl, {
                            method: "POST", 
                            headers: { "Content-Type": "text/plain" },
                            body: JSON.stringify({ action: "retrieve", keywords: factKeywords })
                        });
                        const targetRes = await targetReq.json();
                        if (targetRes.found) {
                            specificContext = targetRes.relevant_memories.join("\n");
                        }
                    }
                } catch(e) { console.warn("Targeted dedup fetch failed", e); }

                // Combine Global Context + Specific Context for the Dedup Prompt
                const dedupContext = (window.lastRetrievedMemories || "") + "\n" + specificContext;
                
                // === DEDUPLICATION & REFINEMENT LOGIC ===
                if (dedupContext.length > 20) {
                    
                    const dedupPrompt = `
                    EXISTING MEMORIES:
                    ${dedupContext}
                    
                    NEW CANDIDATE FACT: "${entry.fact}"
                    CURRENT ENTITIES: "${entry.entities}"
                    
                    TASK: 
                    1. DUPLICATE CHECK: Is this event (or its semantic equivalent) already logged?
                       - Example: "Hate kale" == "Detests leafy greens" -> DUPLICATE.
                    2. ENTITY RESOLUTION: Replace generic names with specific ones (e.g. "Mom" -> "Liliani").
                    3. CLEANUP (CRITICAL): Remove "Arvin stated/mentioned/said" prefixes. Just state the absolute fact.
                       - BAD: "Arvin stated that Casey is tall."
                       - GOOD: "Casey is tall."
                    4. TAG HYGIENE: Remove "Arvin" from entities UNLESS the fact is about him.
                       - Fact: "Casey is tall" -> Remove "Arvin" from tags.
                       - Fact: "Arvin kissed Casey" -> Keep "Arvin" in tags.
                    5. TRANSIENCE CHECK (CRITICAL):
                       - If the fact describes a TEMPORARY feeling/mood (afraid, angry, sad, nervous) about a specific moment, APPEND this note: "(Note: This is a momentary reaction to this specific event)".
                       - BAD: "Arvin is afraid of the price."
                       - GOOD: "Arvin is afraid of the price (Note: This is a momentary reaction to this specific event)."
                    
                    Return JSON: 
                    { 
                      "status": "DUPLICATE" or "NEW",
                      "better_fact": "The refined fact (clean, no 'Arvin said')",
                      "better_entities": "The updated comma-separated list"
                    }
                    `;
                    
                    try {
                        console.log(`🧐 Checking dupes & refining: "${entry.fact}"...`);
                        const check = await fetchWithCognitiveRetry(
                            [{ "role": "system", "content": dedupPrompt }],
                            modelHigh, apiKey, (d) => d.status, "DedupRefine"
                        );

                        if (check.parsed.status === "DUPLICATE") {
                            console.log("🚫 Skipped Duplicate:", entry.fact);
                            continue; 
                        }

                        // Update FACT
                        if (check.parsed.better_fact && check.parsed.better_fact.length > 5) {
                             console.log(`✨ Refined Fact: "${entry.fact}" -> "${check.parsed.better_fact}"`);
                             entry.fact = check.parsed.better_fact;
                        }

                        // Update ENTITIES
                        if (check.parsed.better_entities && check.parsed.better_entities.length > 2) {
                             console.log(`🏷️ Refined Tags: [${entry.entities}] -> [${check.parsed.better_entities}]`);
                             entry.entities = check.parsed.better_entities;
                        }

                    } catch(e) { console.warn("Dedup check failed, saving original."); }
                }
                
                // === EXECUTE STORE ===
                console.log("💾 Saving Memory:", entry.fact);
                
                await fetch(appsScriptUrl, { 
                    method: "POST", 
                    headers: { "Content-Type": "text/plain" },
                    body: JSON.stringify({ 
                        action: "store_atomic", 
                        fact: entry.fact, 
                        entities: entry.entities, 
                        topics: entry.topics, 
                        importance: entry.importance 
                    })
                }).catch(e => console.error("Store Failed", e));
            }
        })();
    }

    return { choices: [{ message: { content: generationResult.cleaned } }] };

};


