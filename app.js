/**
 * NHBS - Non-Human Banking System
 * Core Application Logic & State Controller
 * Digital Banking Unit (DBU) National Prototype
 */

// ----------------------------------------------------
// 1. APPLICATION STATE
// ----------------------------------------------------
const state = {
  user: {
    name: 'Karthikeya Manikandan S',
    account: 'SB-IND-9874102938',
    bank: 'State Bank Ecosystem',
    branch: 'Coimbatore Main DBU',
    pan: 'ABCDE1234F',
    taxFramework: 'A', // 'A' (Annual Return) or 'B' (Continuous Micro-Tax)
    verified: false,
    authToken: '',
    balance: 248500.00, // Default initial balance
    taxPaid: 0.00
  },
  doorStatus: 'CLOSED', // 'CLOSED' or 'OPEN'
  locker: {
    status: 'LOCKED', // 'LOCKED' or 'UNLOCKED'
    pinCode: '1234', // Default Secure Passcode
    buffer: '', // PIN Pad Entry Buffer
    pinVerified: false // Flag to enable biometric step
  },
  speech: {
    lang: 'en-US', // 'en-US', 'ta-IN', 'hi-IN'
    voices: [],
    muted: false,
    active: false,
    lastChatResponse: 'Greetings, I am the NHBS Autonomous Routing Agent. Type your banking requests, and I will analyze the intent patterns to automatically transition your console to the correct operational system.'
  },
  loan: {
    deedUploaded: false,
    photoUploaded: false,
    coordinates: 'Lat: 11.3410° N, Long: 77.7172° E',
    gpsTimestamp: '2026-08-05 00:36:10',
    accuracy: '99.8% (Verified)',
    area: 2500,
    rate: 4200, // Default properties rates
    requestedAmount: 2000000,
    tenure: 10,
    interestRate: 8.50,
    sanctioned: false
  },
  transactions: [],
  auditLogs: []
};

// Map locales to friendly text names
const LANG_NAMES = {
  'en-US': 'English',
  'ta-IN': 'Tamil (தமிழ்)',
  'hi-IN': 'Hindi (हिन्दी)'
};

// Localized confirmation messages for language change alerts
const LANG_CONFIRMATIONS = {
  'en-US': 'Assistant language configured to English.',
  'ta-IN': 'உதவியாளர் மொழி தமிழுக்கு மாற்றப்பட்டது.',
  'hi-IN': 'सहायक भाषा हिंदी पर सेट की गई है।'
};

// ----------------------------------------------------
// 2. HELPER UTILITIES
// ----------------------------------------------------
const formatCurrency = (val) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(val);
};

const getTimestamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// Log event helper
const logEvent = (category, message) => {
  const timestamp = getTimestamp();
  state.auditLogs.push({ timestamp, category, message });

  const body = document.getElementById('audit-log-body');
  if (body) {
    // Clear initial placeholder if present
    if (state.auditLogs.length === 1 && body.innerHTML.includes('System booted')) {
      body.innerHTML = '';
    }

    const row = document.createElement('div');
    row.className = 'terminal-row';
    
    let tagClass = 'tag-system';
    if (category === 'SECURITY') tagClass = 'tag-security';
    if (category === 'TAX') tagClass = 'tag-tax';
    if (category === 'TRANSACTION') tagClass = 'tag-trans';
    if (category === 'VAULT') tagClass = 'tag-vault';

    row.innerHTML = `
      <span class="time">[${timestamp}]</span>
      <span class="tag ${tagClass}">[${category}]</span>
      <span class="msg">${message}</span>
    `;
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }
};

// ----------------------------------------------------
// 3. MULTILINGUAL TEXT-TO-SPEECH (TTS) ENGINE
// ----------------------------------------------------
const initSpeechEngine = () => {
  const loadVoices = () => {
    state.speech.voices = window.speechSynthesis.getVoices();
  };
  
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
};

const speakPrompt = (text, customLang = null) => {
  if (!window.speechSynthesis) return;
  if (state.speech.muted) return;

  // WORKAROUND: Cancel speech and trigger resume to unblock any stuck synthesis states in Chrome
  window.speechSynthesis.cancel();
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }

  // Determine language dynamically if not explicitly passed
  let lang = customLang || state.speech.lang;
  if (!customLang) {
    if (/[\u0B80-\u0BFF]/.test(text)) {
      lang = 'ta-IN';
    } else if (/[\u0900-\u097F]/.test(text)) {
      lang = 'hi-IN';
    }
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;

  // WORKAROUND: Retain reference to utterance object to prevent Chrome garbage collection cutoff bug
  state.speech.activeUtterance = utterance;

  // Find a matching voice for the target locale
  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length > 0) {
    state.speech.voices = voices;
  }

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const professionalVoices = state.speech.voices.filter(v => !/fred|bells|cellos|zarvox|whisper/i.test(v.name));

  const normalizedTarget = lang.toLowerCase().replace('_', '-');
  const targetPrefix = normalizedTarget.split('-')[0];
  
  let matchingVoice = null;

  if (targetPrefix === 'en') {
    const EnglishPriority = ["samantha", "google us english", "microsoft zira", "microsoft david", "siri", "daniel"];
    for (const priorityName of EnglishPriority) {
      matchingVoice = professionalVoices.find(v => 
        v.name.toLowerCase().includes(priorityName) && 
        v.lang.toLowerCase().replace('_', '-').startsWith('en')
      );
      if (matchingVoice) break;
    }
  }

  if (!matchingVoice) {
    matchingVoice = professionalVoices.find(v => v.lang.toLowerCase().replace('_', '-') === normalizedTarget);
  }
  if (!matchingVoice) {
    matchingVoice = professionalVoices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix));
  }
  if (!matchingVoice) {
    matchingVoice = state.speech.voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix));
  }

  if (matchingVoice && (matchingVoice.localService || !isMobile)) {
    utterance.voice = matchingVoice;
  }

  // Animation triggers on waveform
  const waveform = document.getElementById('waveform');
  const statusText = document.getElementById('voice-wave-status');

  utterance.onstart = () => {
    if (waveform) waveform.classList.add('speaking');
    if (statusText) statusText.innerText = `ASSISTANT SPEAKING (${LANG_NAMES[lang] || lang})`;
    const stopBtn = document.getElementById('btn-floating-stop');
    if (stopBtn) stopBtn.classList.remove('hidden');
    state.speech.active = true;
  };

  utterance.onend = () => {
    if (waveform) waveform.classList.remove('speaking');
    if (statusText) statusText.innerText = 'ASSISTANT IDLE';
    const stopBtn = document.getElementById('btn-floating-stop');
    if (stopBtn) stopBtn.classList.add('hidden');
    state.speech.active = false;
    state.speech.activeUtterance = null;
  };

  utterance.onerror = (e) => {
    console.error('SpeechSynthesis error:', e);
    if (waveform) waveform.classList.remove('speaking');
    if (statusText) statusText.innerText = 'ASSISTANT IDLE';
    const stopBtn = document.getElementById('btn-floating-stop');
    if (stopBtn) stopBtn.classList.add('hidden');
    state.speech.active = false;
    state.speech.activeUtterance = null;
  };

  // WORKAROUND: Small timeout delay between cancel() and speak() prevents Chrome race condition dropouts
  setTimeout(() => {
    window.speechSynthesis.speak(utterance);
  }, 50);
};

// ----------------------------------------------------
// 4. VIEW ROUTER & NAVIGATION
// ----------------------------------------------------
const switchTab = (tabId) => {
  // STRICT RULE: Instant Stop on Navigation (switching views)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  const stopBtn = document.getElementById('btn-floating-stop');
  if (stopBtn) stopBtn.classList.add('hidden');
  state.speech.active = false;

  // Toggle tab panels
  const panels = document.querySelectorAll('.tab-panel');
  panels.forEach(p => {
    if (p.id === `view-${tabId}`) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  // Toggle active class on navigation links
  const links = document.querySelectorAll('.sidebar-nav .nav-link');
  links.forEach(l => {
    if (l.getAttribute('data-tab') === tabId) {
      l.classList.add('active');
    } else {
      l.classList.remove('active');
    }
  });

  logEvent('SYSTEM', `Console routed to view: ${tabId.toUpperCase()}`);
};

// Setup Navigation bindings
const initNavigation = () => {
  // Sidebar Nav clicks
  const links = document.querySelectorAll('.sidebar-nav .nav-link');
  links.forEach(l => {
    l.addEventListener('click', () => {
      const tabId = l.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Dashboard grid card clicks
  const cards = document.querySelectorAll('.module-nav-card');
  cards.forEach(c => {
    c.addEventListener('click', () => {
      const target = c.getAttribute('data-target');
      switchTab(target);
    });
  });
};

// ----------------------------------------------------
// 5. VIEW 1: CUSTOMER ONBOARDING & GATE SCANNER
// ----------------------------------------------------
const initOnboarding = () => {
  const form = document.getElementById('onboarding-form');
  const scanBtn = document.getElementById('biometric-scanner-btn');
  const statusMsg = document.getElementById('onboarding-status');
  const btnSpeakOnboarding = document.getElementById('btn-speak-onboarding');

  // Prefill the form coordinates based on the initial balance input
  const initialBalanceInput = document.getElementById('input-balance');
  if (initialBalanceInput) {
    state.user.balance = parseFloat(initialBalanceInput.value) || 248500.00;
  }

  if (btnSpeakOnboarding) {
    btnSpeakOnboarding.addEventListener('click', () => {
      const instructionText = "Welcome to the Non-Human Banking System. To begin onboarding, enter your name, bank account parameter details, and PAN identifier. Specify your starting capital account balance, then tap the biometric scanner ring to verify credentials via eKYC.";
      speakPrompt(instructionText);
    });
  }

  scanBtn.addEventListener('click', () => {
    if (!form.reportValidity()) {
      statusMsg.innerText = 'Credentials invalid. Fill all fields according to protocol.';
      statusMsg.className = 'status-msg error';
      return;
    }

    // Capture starting balance from onboarding input
    const balanceVal = parseFloat(document.getElementById('input-balance').value);
    if (!isNaN(balanceVal)) {
      state.user.balance = balanceVal;
    }

    // Enter scanning visual state
    scanBtn.classList.add('scanning');
    scanBtn.disabled = true;
    statusMsg.innerText = 'Initializing Sat-Core eKYC connection...';
    statusMsg.className = 'status-msg';

    // Simulated scanning lag
    setTimeout(() => {
      const randomHex = Math.floor(1000 + Math.random() * 8999).toString(16).toUpperCase();
      const syntheticToken = `[Aadhaar_eKYC_Token_Verified_NHBS2026_${randomHex}]`;

      // Save credentials into State
      state.user.name = document.getElementById('input-name').value;
      state.user.account = document.getElementById('input-account').value;
      state.user.bank = document.getElementById('input-bank').value;
      state.user.branch = document.getElementById('input-branch').value;
      state.user.pan = document.getElementById('input-pan').value;
      state.user.verified = true;
      state.user.authToken = syntheticToken;

      // Update UI components
      scanBtn.classList.remove('scanning');
      scanBtn.classList.add('verified');
      statusMsg.innerText = 'eKYC Verification Success! Issuer synthetic token created.';
      statusMsg.className = 'status-msg success';

      logEvent('SECURITY', `eKYC verified. Issued synthetic token placeholder: ${syntheticToken}`);
      
      // Animate gates sliding open on onboarding overlay
      setTimeout(() => {
        document.getElementById('onboarding-card').classList.add('fade-out');
        document.getElementById('onboarding-overlay').classList.add('gate-open');
        
        // Trigger Tax Framework Dialog Popup
        setTimeout(() => {
          const modal = document.getElementById('tax-framework-modal');
          if (modal) {
            modal.showModal();
          }
        }, 800);
      }, 1000);

    }, 2500);
  });

  // Modal confirm action
  const confirmTaxBtn = document.getElementById('confirm-tax-framework-btn');
  confirmTaxBtn.addEventListener('click', () => {
    const selectedMode = document.querySelector('input[name="tax-mode-selection"]:checked').value;
    state.user.taxFramework = selectedMode;

    // Synchronize state values into Dashboard DOM
    document.getElementById('card-name').innerText = state.user.name;
    document.getElementById('card-account').innerText = state.user.account;
    document.getElementById('card-bank').innerText = `${state.user.bank} / ${state.user.branch}`;
    document.getElementById('card-pan').innerText = state.user.pan;
    document.getElementById('card-token').innerText = state.user.authToken;
    document.getElementById('card-tax-mode').innerText = selectedMode === 'A' ? 'OPTION A (ITR filing)' : 'OPTION B (Micro-Tax)';

    // Update top bar values
    document.getElementById('top-bar-name').innerText = state.user.name;
    document.getElementById('top-bar-auth-token').innerText = `Token: ${state.user.authToken}`;
    document.getElementById('metric-tax-mode').innerText = selectedMode === 'A' ? 'OPTION A' : 'OPTION B';
    
    const taxBadge = document.getElementById('badge-tax-view-mode');
    if (taxBadge) {
      if (selectedMode === 'B') {
        taxBadge.innerText = 'OPTION B (MICRO-TAX ENGINE ACTIVE)';
        taxBadge.className = 'badge badge-green';
      } else {
        taxBadge.innerText = 'OPTION A (ANNUAL ITR FILING ACTIVE)';
        taxBadge.className = 'badge badge-yellow';
      }
    }

    const microTaxBadge = document.getElementById('badge-microtax-view-mode');
    if (microTaxBadge) {
      if (selectedMode === 'B') {
        microTaxBadge.innerText = 'CONTINUOUS AUTOMATED DEBITS ON';
        microTaxBadge.className = 'badge badge-green';
      } else {
        microTaxBadge.innerText = 'CONTINUOUS AUTOMATED DEBITS DEFERRED';
        microTaxBadge.className = 'badge badge-yellow';
      }
    }

    // Sync receipt preview form values
    document.getElementById('receipt-pan').innerText = state.user.pan;
    document.getElementById('receipt-token').innerText = state.user.authToken;

    // Write initial log
    logEvent('SECURITY', `Access granted to user ${state.user.name}. System integrated.`);
    logEvent('TAX', `Framework set to Mode Option ${selectedMode}. Engine active.`);

    updateMetricsDOM();

    // Hide onboarding overlay and reveal main app
    const modal = document.getElementById('tax-framework-modal');
    modal.close();
    
    document.getElementById('onboarding-overlay').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');

    // Default route to dashboard
    switchTab('dashboard');
  });
};

// ----------------------------------------------------
// 6. VIEW 4: AUTOMATIC DOOR SYSTEM & Telemetry
// ----------------------------------------------------
const updateDoorsState = (targetState) => {
  state.doorStatus = targetState;

  const frame = document.querySelector('.door-frame');
  const btn = document.getElementById('btn-toggle-door');
  const statusOverlay = document.getElementById('door-scanner-status');
  const dashBadge = document.getElementById('badge-dash-door');
  const navBadge = document.getElementById('badge-door-status');
  const telemLaser = document.getElementById('telem-laser');

  if (targetState === 'OPEN') {
    frame.classList.add('open');
    btn.innerText = 'TRIGGER GATE CLOSE';
    btn.className = 'btn btn-green font-orbitron';
    statusOverlay.innerText = 'GATE OPEN (PROCEED)';
    statusOverlay.className = 'door-overlay-status text-green font-orbitron';
    
    dashBadge.innerText = 'GATE UNLOCKED';
    const dashDot = document.getElementById('dot-dash-door-active');
    if (dashDot) dashDot.className = 'status-dot green';

    navBadge.innerText = 'OPEN';
    navBadge.className = 'badge badge-green sidebar-badge';

    telemLaser.innerText = 'DEACTIVATED';
    telemLaser.className = 'telemetry-val text-green font-mono';

    logEvent('SECURITY', 'Entrance gates physically OPENED. Lasers offline.');
  } else {
    frame.classList.remove('open');
    btn.innerText = 'TRIGGER GATE OPEN';
    btn.className = 'btn btn-red font-orbitron';
    statusOverlay.innerText = 'SECURE GATE LOCKED';
    statusOverlay.className = 'door-overlay-status text-red font-orbitron';
    
    dashBadge.innerText = 'GATE SECURED';
    const dashDot = document.getElementById('dot-dash-door-active');
    if (dashDot) dashDot.className = 'status-dot red';

    navBadge.innerText = 'SECURE';
    navBadge.className = 'badge badge-accent sidebar-badge';

    telemLaser.innerText = 'ACTIVE (HIGH VOLTAGE)';
    telemLaser.className = 'telemetry-val text-red font-mono';

    logEvent('SECURITY', 'Entrance gates physically LOCKED. Laser grids online.');
  }
};

const initDoorsSystem = () => {
  const btn = document.getElementById('btn-toggle-door');
  const btnSpeak = document.getElementById('btn-speak-doors');

  if (btnSpeak) {
    btnSpeak.addEventListener('click', () => {
      const statusText = `Door telemetry stream active. Entrance gates are currently ${state.doorStatus === 'OPEN' ? 'OPEN and boundary security lasers are deactivated' : 'CLOSED and secure laser fences are fully active'}. Lock hydraulics pressure is nominal at four hundred twenty Bar.`;
      speakPrompt(statusText);
    });
  }

  btn.addEventListener('click', () => {
    if (state.doorStatus === 'CLOSED') {
      updateDoorsState('OPEN');
    } else {
      updateDoorsState('CLOSED');
    }
  });

  // Simulated telemetry logs
  setInterval(() => {
    if (!state.user.verified) return;
    const sensors = ['Optical alignment: nominal', 'Hydraulics pressure: 420 Bar', 'Laser grid boundaries secured', 'Control circuit: PASS'];
    const selected = sensors[Math.floor(Math.random() * sensors.length)];
    const logBox = document.getElementById('sensor-telemetry-logs');
    if (logBox) {
      const item = document.createElement('div');
      item.className = 'sensor-log-item';
      item.innerHTML = `<span class="log-time font-mono">[${getTimestamp().split(' ')[1]}]</span> SENSOR TELEM: ${selected}`;
      logBox.appendChild(item);
      logBox.scrollTop = logBox.scrollHeight;
    }
  }, 10000);
};

// ----------------------------------------------------
// 7. VIEW 5: MULTILINGUAL AI VOICE ASSISTANT HUB
// ----------------------------------------------------
const initVoiceHub = () => {
  const langSelect = document.getElementById('select-voice-lang');
  const customTxt = document.getElementById('tts-manual-input');
  const triggerBtn = document.getElementById('btn-trigger-speech');

  // Sync language selection
  langSelect.addEventListener('change', () => {
    state.speech.lang = langSelect.value;
    logEvent('SYSTEM', `Voice vocal language switched to: ${state.speech.lang}`);
    const confirmationText = LANG_CONFIRMATIONS[state.speech.lang] || `Language set to ${LANG_NAMES[state.speech.lang]}`;
    speakPrompt(confirmationText, state.speech.lang);
  });

  // Trigger manual speech translation
  triggerBtn.addEventListener('click', () => {
    const text = customTxt.value.trim();
    if (text) {
      speakPrompt(text);
      logEvent('SYSTEM', `Vocal synthesis executed: "${text.substring(0, 30)}..."`);
    }
  });

  // Broadcast preset clicks
  const presets = document.querySelectorAll('.preset-speech-btn');
  presets.forEach(p => {
    p.addEventListener('click', () => {
      let promptText = p.getAttribute('data-en');
      if (state.speech.lang === 'ta-IN') promptText = p.getAttribute('data-ta');
      if (state.speech.lang === 'hi-IN') promptText = p.getAttribute('data-hi');
      
      speakPrompt(promptText);
      logEvent('SYSTEM', `Broadcast vocalized: "${promptText.substring(0, 30)}..."`);
    });
  });
};

// ----------------------------------------------------
// 8. VIEW 6: AI HELP DESK & INTENT CLASSIFIER
// ----------------------------------------------------
const processChatbotQuery = (query) => {
  if (!query) return;

  const chatHistory = document.getElementById('chat-messages');
  const classifierFeedback = document.getElementById('classifier-feedback');

  // Render User Message
  const userRow = document.createElement('div');
  userRow.className = 'chat-message user-msg';
  userRow.innerHTML = `<p>${query}</p><span class="message-time font-mono">${getTimestamp().split(' ')[1]}</span>`;
  chatHistory.appendChild(userRow);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  // Intent classification logic (regular expression pattern matching)
  let intent = 'UNKNOWN';
  let responseText = '';
  let targetTab = null;

  const q = query.toLowerCase();

  if (/\bfile\b|\bitr\b|\bdeduct\b|\binflow\b|\btax\b/i.test(q)) {
    intent = 'ITR_TAXATION_LEDGER';
    responseText = 'I have identified your request for tax return filing processes. Transitioning you to the AI Tax Ledger console.';
    targetTab = 'taxation';
  } else if (/\bspend\b|\bspending\b|\btransaction\b|\bgst\b|\bpurchase\b|\bluxury\b|\bessential\b/i.test(q)) {
    intent = 'MICROTAX_ENGINE';
    responseText = 'Launching spend simulator. Transitioning you to the Spending-Based Automated Micro-Tax Engine.';
    targetTab = 'microtax';
  } else if (/\bdeed\b|\bloan\b|\bproperty\b|\bvaluation\b|\bltv\b|\bgeotag\b/i.test(q)) {
    intent = 'PROPERTY_LOAN';
    responseText = 'Initiating property site scanning protocols. Transitioning you to the AI Geotagged Property Loan System console.';
    targetTab = 'loan';
  } else if (/\bdoor\b|\bgate\b|\bentry\b|\bexit\b|\btelemetry\b|\bopen\b|\bclose\b/i.test(q)) {
    intent = 'DOOR_TELEMETRY';
    responseText = 'Analyzing door telemetry logs. Redirecting to the entrance gate hydraulic system controls.';
    targetTab = 'doors';
  } else if (/\blocker\b|\bvault\b|\bsafe\b|\bpin\b|\bcode\b/i.test(q)) {
    intent = 'VAULT_LOCKER';
    responseText = 'Securing 2-Factor vault access coordinates. Opening safe deposit locker matrix panel.';
    targetTab = 'vault';
  } else if (/\bwealth\b|\binvest\b|\bportfolio\b|\bsaving\b|\bfd\b|\bgold\b|\bfunds\b/i.test(q)) {
    intent = 'WEALTH_ADVISOR';
    responseText = 'Running wealth optimization matrix models. Navigating to the AI Wealth Portfolio allocation engine.';
    targetTab = 'wealth';
  } else if (/\blog\b|\baudit\b|\bhistory\b|\bledger\b|\brecord\b/i.test(q)) {
    intent = 'AUDIT_LEDGER';
    responseText = 'Loading secure encryption logs. Opening the core transaction audit logs ledger.';
    targetTab = 'audit';
  } else if (/\bhome\b|\bdashboard\b|\bprofile\b|\bmain\b/i.test(q)) {
    intent = 'DASHBOARD';
    responseText = 'Returning user console to the Central Smart Branch Dashboard.';
    targetTab = 'dashboard';
  } else {
    intent = 'GENERAL_ASSISTANCE';
    responseText = 'I have registered your prompt, but could not isolate a specific navigation routing intent. You can view module parameters on the main dashboard.';
  }

  // Display classified intent details in chatbot header
  classifierFeedback.innerText = `INTENT: ${intent} (98% Conf)`;

  // Speak and render bot response after slight latency simulation
  setTimeout(() => {
    const botRow = document.createElement('div');
    botRow.className = 'chat-message bot-msg';
    botRow.innerHTML = `<p>${responseText}</p><span class="message-time font-mono">${getTimestamp().split(' ')[1]}</span>`;
    chatHistory.appendChild(botRow);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    state.speech.lastChatResponse = responseText;
    logEvent('SYSTEM', `Help desk intent parsed: ${intent}`);

    // Transition tab if classified
    if (targetTab) {
      setTimeout(() => {
        switchTab(targetTab);
      }, 2000);
    }
  }, 800); // 800ms lag simulation
};

// ----------------------------------------------------
// 9. VIEW 7 & 8: AI TAX LEDGER & SIMULATOR ENGINE
// ----------------------------------------------------
const updateMetricsDOM = () => {
  document.getElementById('metric-balance').innerText = formatCurrency(state.user.balance);
  document.getElementById('metric-tax-paid').innerText = formatCurrency(state.user.taxPaid);
  
  // Also update dashboard gold benchmark value slightly for dynamic feel
  const goldRate = 6850 + (Math.random() * 6 - 3);
  const benchGold = document.getElementById('bench-gold');
  if (benchGold) {
    benchGold.innerText = `₹${goldRate.toFixed(2)} / g`;
  }
};

const initTaxationEngine = () => {
  // File annual tax returns under Option A
  const btnFile = document.getElementById('btn-file-tax-return');
  const btnSpeakTax = document.getElementById('btn-speak-tax-status');

  if (btnSpeakTax) {
    btnSpeakTax.addEventListener('click', () => {
      const text = `Annual Income Tax Ledger. Gross salary inflow is eight lakh fifty thousand rupees. Deductions are one lakh fifty thousand rupees. Calculated net tax due is thirty two thousand five hundred rupees. Click File ITR to execute payment.`;
      speakPrompt(text);
    });
  }

  btnFile.addEventListener('click', () => {
    const taxAmount = 32500.00;

    if (state.user.balance < taxAmount) {
      logEvent('TAX', 'ITR Filing Aborted: Insufficient account capital reserves.');
      alert('ITR Filing Error: Insufficient balance to settle annual tax return.');
      return;
    }

    // Settle tax
    state.user.balance -= taxAmount;
    state.user.taxPaid += taxAmount;
    updateMetricsDOM();

    // Show receipt
    document.getElementById('itr-receipt-container').classList.remove('hidden');

    logEvent('TAX', `Annual return ITR-2026-98124 successfully filed. Settled liabilities: ${formatCurrency(taxAmount)}.`);
  });
};

const initMicroTaxEngine = () => {
  const spendBtns = document.querySelectorAll('.spend-btn');
  const simLedger = document.getElementById('sim-transaction-ledger');
  const btnSpeakMicro = document.getElementById('btn-speak-microtax-status');

  if (btnSpeakMicro) {
    btnSpeakMicro.addEventListener('click', () => {
      const text = `Spending micro tax engine rule matrix. Luxury spend is taxed at twenty eight percent. Service dining out is eighteen percent. Utilities is twelve percent. Essentials are five percent. Precious metals are three percent. Medical kits are zero percent. Automated deductions apply if option B is active.`;
      speakPrompt(text);
    });
  }

  spendBtns.forEach(b => {
    b.addEventListener('click', () => {
      const category = b.getAttribute('data-category');
      const amount = parseFloat(b.getAttribute('data-amount'));
      const item = b.getAttribute('data-item');

      let gstRate = 0;
      if (category === 'Luxury') gstRate = 0.28;
      if (category === 'Service') gstRate = 0.18;
      if (category === 'Standard') gstRate = 0.12;
      if (category === 'Essential') gstRate = 0.05;
      if (category === 'Precious') gstRate = 0.03;
      if (category === 'Exempt') gstRate = 0.00;

      const computedGst = amount * gstRate;
      const totalDebit = amount + computedGst;

      if (state.user.balance < totalDebit) {
        logEvent('TRANSACTION', `Spend simulation failed on ${item}. Insufficient balance.`);
        alert('Simulator Error: Insufficient balance for this transaction.');
        return;
      }

      // Check tax operational mode selected at onboarding
      const mode = state.user.taxFramework;

      let logMessage = '';
      if (mode === 'B') {
        // Option B: Continuous debit (deduct cost + tax immediately)
        state.user.balance -= totalDebit;
        state.user.taxPaid += computedGst;
        updateMetricsDOM();

        logMessage = `Deducted: ${formatCurrency(amount)} + Micro-Tax ${formatCurrency(computedGst)} (GST ${gstRate*100}%)`;
        logEvent('TRANSACTION', `Micro-Tax Auto-Debit: ${item}. Paid ${formatCurrency(totalDebit)} incl. GST.`);
      } else {
        // Option A: manual return debits base cost only, defers tax
        state.user.balance -= amount;
        updateMetricsDOM();

        logMessage = `Approved: ${formatCurrency(amount)}. Deferred Tax ${formatCurrency(computedGst)} (GST ${gstRate*100}%)`;
        logEvent('TRANSACTION', `Transaction Approved (Option A): ${item}. Cost ${formatCurrency(amount)} debited. GST deferred.`);
      }

      // Render log line in simulator view
      if (simLedger && simLedger.innerHTML.includes('No simulated transactions')) {
        simLedger.innerHTML = '';
      }

      if (simLedger) {
        const logRow = document.createElement('div');
        logRow.className = 'ledger-transaction-item';
        logRow.innerHTML = `
          <span>[${category}] ${item}</span>
          <strong class="${mode === 'B' ? 'text-green' : 'text-cyan'}">${logMessage}</strong>
        `;
        simLedger.appendChild(logRow);
        simLedger.scrollTop = simLedger.scrollHeight;
      }
    });
  });
};

// ----------------------------------------------------
// 10. VIEW 9: AI WEALTH & PORTFOLIO ADVISOR
// ----------------------------------------------------
const initPortfolioAdvisor = () => {
  const savingsInput = document.getElementById('savings-input');
  const btnGenerate = document.getElementById('btn-generate-portfolio');
  const btnListen = document.getElementById('btn-portfolio-voice-read');

  // Split calculation helper
  const calculateSplit = () => {
    const savings = parseFloat(savingsInput.value);
    if (isNaN(savings) || savings <= 0) {
      alert('Provide a valid savings capacity greater than zero.');
      return null;
    }

    const fd = savings * 0.40;
    const sgb = savings * 0.30;
    const mutual = savings * 0.30;

    return { savings, fd, sgb, mutual };
  };

  const updatePortfolioUI = (split) => {
    if (!split) return;

    document.getElementById('portfolio-fd-val').innerText = formatCurrency(split.fd);
    document.getElementById('portfolio-sgb-val').innerText = formatCurrency(split.sgb);
    document.getElementById('portfolio-index-val').innerText = formatCurrency(split.mutual);

    // Trigger visual reflow for progress fill width
    document.getElementById('portfolio-fd-fill').style.width = '40%';
    document.getElementById('portfolio-sgb-fill').style.width = '30%';
    document.getElementById('portfolio-index-fill').style.width = '30%';
  };

  btnGenerate.addEventListener('click', () => {
    const split = calculateSplit();
    if (split) {
      updatePortfolioUI(split);
      logEvent('SYSTEM', `Wealth Advisor: Portfolio allocation computed for monthly savings of ${formatCurrency(split.savings)}.`);
      
      const audioText = `Portfolio allocation generated. Monthly savings of ${formatCurrency(split.savings)} structures into: Fixed Deposits forty percent at ${formatCurrency(split.fd)}. Sovereign Gold Bonds thirty percent at ${formatCurrency(split.sgb)}. Index Mutual Funds thirty percent at ${formatCurrency(split.mutual)}.`;
      speakPrompt(audioText);
    }
  });

  btnListen.addEventListener('click', () => {
    const split = calculateSplit();
    if (split) {
      const audioText = `Sovereign wealth split models recommend: Allocate ${formatCurrency(split.fd)} in secure yielding Fixed Deposits. Allocate ${formatCurrency(split.sgb)} in inflation hedging Gold Bonds. Position remaining ${formatCurrency(split.mutual)} in index tracking Mutual Funds.`;
      speakPrompt(audioText);
    }
  });
};

// ----------------------------------------------------
// 11. VIEW 10: AI GEOTAGGED PROPERTY LOAN SYSTEM
// ----------------------------------------------------
const initLoanSystem = () => {
  const deedUpload = document.getElementById('deed-upload-slot');
  const photoUpload = document.getElementById('photo-upload-slot');
  const deedLabel = document.getElementById('deed-label');
  const photoLabel = document.getElementById('photo-label');
  const btnDeed = document.getElementById('btn-load-sample-deed');
  const btnPhoto = document.getElementById('btn-load-sample-photo');
  
  const scannerContainer = document.getElementById('exif-scanner-container');
  const exifPanel = document.getElementById('exif-data-panel');
  const exifTime = document.getElementById('exif-time');

  const inputArea = document.getElementById('loan-area');
  const inputRate = document.getElementById('loan-rate');
  const valTotal = document.getElementById('loan-val-total');
  const valMax = document.getElementById('loan-val-max');
  
  const inputRequested = document.getElementById('loan-requested');
  const rangeRequested = document.getElementById('loan-requested-range');
  const badgeCap = document.getElementById('badge-ltv-cap');
  
  const inputTenure = document.getElementById('loan-tenure');
  const labelTenure = document.getElementById('label-loan-tenure');
  const emiValue = document.getElementById('loan-emi-value');
  const btnSanction = document.getElementById('btn-generate-sanction');
  
  const sanctionContainer = document.getElementById('sanction-letter-container');
  const sanctionName = document.getElementById('sanction-name');
  const sanctionToken = document.getElementById('sanction-token');
  const sanctionCoords = document.getElementById('sanction-coords');
  const sanctionGpsAccuracy = document.getElementById('sanction-gps-accuracy');
  const sanctionPropVal = document.getElementById('sanction-prop-val');
  const sanctionLoanAmount = document.getElementById('sanction-loan-amount');
  const sanctionLtvRatio = document.getElementById('sanction-ltv-ratio');
  const sanctionEmi = document.getElementById('sanction-emi');
  const sanctionRefNo = document.getElementById('sanction-ref-no');
  const btnSanctionSpeak = document.getElementById('btn-sanction-speak');

  // Recalculate property valuation and strict 50% LTV limit
  const recalculateLoan = () => {
    const area = parseFloat(inputArea.value) || 0;
    const rate = parseFloat(inputRate.value) || 0;
    const totalValuation = area * rate;
    const maxApproved = totalValuation * 0.50; // STRICT 50% LTV Cap

    valTotal.innerText = formatCurrency(totalValuation);
    valMax.innerText = formatCurrency(maxApproved);

    // Update state
    state.loan.area = area;
    state.loan.rate = rate;

    // Limit slide bounds
    rangeRequested.max = maxApproved;
    
    let requested = parseFloat(inputRequested.value) || 0;
    
    // Strict enforcement check
    if (requested > maxApproved) {
      requested = maxApproved;
      inputRequested.value = requested;
      badgeCap.classList.remove('hidden');
    } else if (requested === maxApproved && maxApproved > 0) {
      badgeCap.classList.remove('hidden'); // Show limit warning badge
    } else {
      badgeCap.classList.add('hidden');
    }

    rangeRequested.value = requested;
    state.loan.requestedAmount = requested;

    // EMI Calculation
    const principal = requested;
    const annualInterest = state.loan.interestRate;
    const monthlyRate = annualInterest / 12 / 100;
    const tenureMonths = state.loan.tenure * 12;

    let emi = 0;
    if (principal > 0 && monthlyRate > 0 && tenureMonths > 0) {
      emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) / (Math.pow(1 + monthlyRate, tenureMonths) - 1);
    }

    emiValue.innerText = formatCurrency(emi);
    return { totalValuation, maxApproved, requested, emi };
  };

  inputArea.addEventListener('input', recalculateLoan);
  inputRate.addEventListener('input', recalculateLoan);
  
  inputRequested.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value) || 0;
    const area = parseFloat(inputArea.value) || 0;
    const rate = parseFloat(inputRate.value) || 0;
    const maxApproved = area * rate * 0.50;

    if (val > maxApproved) {
      val = maxApproved;
      e.target.value = val;
      badgeCap.classList.remove('hidden');
    }
    
    rangeRequested.value = val;
    state.loan.requestedAmount = val;
    recalculateLoan();
  });

  rangeRequested.addEventListener('input', (e) => {
    inputRequested.value = e.target.value;
    state.loan.requestedAmount = parseFloat(e.target.value) || 0;
    recalculateLoan();
  });

  inputTenure.addEventListener('input', (e) => {
    const years = parseInt(e.target.value) || 1;
    labelTenure.innerText = `${years} Year${years > 1 ? 's' : ''}`;
    state.loan.tenure = years;
    recalculateLoan();
  });

  // Check upload verification triggers
  const checkUploadStatus = () => {
    if (state.loan.deedUploaded && state.loan.photoUploaded) {
      btnSanction.disabled = false;
      const hdrBadge = document.getElementById('badge-loan-hdr');
      if (hdrBadge) {
        hdrBadge.innerText = "SURVEY ACCREDITED";
        hdrBadge.className = "badge badge-green";
      }
    }
  };

  const verifyDeed = () => {
    deedLabel.innerText = "📄 Verified_Deed_Checksum_Pass.pdf";
    deedUpload.style.borderColor = "var(--accent-green)";
    state.loan.deedUploaded = true;
    logEvent('SECURITY', 'Deed document checksum validated against land archives.');
    checkUploadStatus();
  };

  btnDeed.addEventListener('click', (e) => {
    e.stopPropagation();
    verifyDeed();
  });

  deedUpload.addEventListener('dragover', (e) => {
    e.preventDefault();
    deedUpload.style.background = "rgba(0, 242, 254, 0.08)";
  });
  deedUpload.addEventListener('dragleave', () => {
    deedUpload.style.background = "rgba(0, 242, 254, 0.02)";
  });
  deedUpload.addEventListener('drop', (e) => {
    e.preventDefault();
    deedUpload.style.background = "rgba(0, 242, 254, 0.02)";
    verifyDeed();
  });

  const verifyPhoto = () => {
    photoUpload.classList.add('hidden');
    scannerContainer.classList.remove('hidden');

    setTimeout(() => {
      scannerContainer.classList.add('hidden');
      photoUpload.classList.remove('hidden');
      photoLabel.innerText = "📸 Sat_Core_Elevation_Verified.jpg";
      photoUpload.style.borderColor = "var(--accent-green)";
      exifPanel.classList.remove('hidden');
      
      const dateStr = getTimestamp();
      exifTime.innerText = dateStr;
      
      state.loan.photoUploaded = true;
      state.loan.gpsTimestamp = dateStr;

      logEvent('SECURITY', 'Site photo EXIF tagging scanned. Coordinates matched: Lat 11.3410 N, Long 77.7172 E.');
      checkUploadStatus();
    }, 2000);
  };

  btnPhoto.addEventListener('click', (e) => {
    e.stopPropagation();
    verifyPhoto();
  });

  photoUpload.addEventListener('dragover', (e) => {
    e.preventDefault();
    photoUpload.style.background = "rgba(0, 242, 254, 0.08)";
  });
  photoUpload.addEventListener('dragleave', () => {
    photoUpload.style.background = "rgba(0, 242, 254, 0.02)";
  });
  photoUpload.addEventListener('drop', (e) => {
    e.preventDefault();
    photoUpload.style.background = "rgba(0, 242, 254, 0.02)";
    verifyPhoto();
  });

  // Sanction generator trigger
  btnSanction.addEventListener('click', () => {
    const { totalValuation, requested, emi } = recalculateLoan();
    
    sanctionRefNo.innerText = "REF: #LAP-2026-88421";
    sanctionName.innerText = state.user.name;
    sanctionToken.innerText = state.user.authToken;
    sanctionCoords.innerText = state.loan.coordinates;
    sanctionGpsAccuracy.innerText = state.loan.accuracy;
    sanctionPropVal.innerText = formatCurrency(totalValuation);
    sanctionLoanAmount.innerText = formatCurrency(requested);
    sanctionLtvRatio.innerText = `${((requested / totalValuation) * 100).toFixed(2)}% [50% Max Cap Compliant]`;
    sanctionEmi.innerText = `${formatCurrency(emi)} / Month`;

    // Show letter view
    sanctionContainer.classList.remove('hidden');
    sanctionContainer.scrollIntoView({ behavior: 'smooth' });

    logEvent('TRANSACTION', `Asset-Backed Loan Sanctioned. Ref: LAP-2026-88421. Principal: ${formatCurrency(requested)}.`);
  });

  btnSanctionSpeak.addEventListener('click', () => {
    const { requested, emi } = recalculateLoan();
    let readText = '';
    if (state.speech.lang === 'ta-IN') {
      readText = `சொத்து பிணைய கடன் அனுமதி விவரங்கள். விண்ணப்பதாரர் கார்த்திகேய மணிகண்டன். அனுமதிக்கப்பட்ட கடன் தொகை ${formatCurrency(requested)}. மாத தவணை ${formatCurrency(emi)}. வட்டி விகிதம் எட்டு புள்ளி ஐந்து சதவீதம்.`;
    } else if (state.speech.lang === 'hi-IN') {
      readText = `संपत्ति ऋण मंजूरी ज्ञापन। उधारकर्ता कार्तिकेय मणिकंदन है। स्वीकृत ऋण राशि ${formatCurrency(requested)} रुपये है। मासिक ईएमआई ${formatCurrency(emi)} रुपये है। ब्याज दर आठ दशमलव पांच प्रतिशत है।`;
    } else {
      readText = `Loan sanction memorandum details. Borrower is ${state.user.name}. Sanctioned loan principal is ${formatCurrency(requested)} at a fixed interest rate of eight point five percent per annum. Estimated monthly installment is ${formatCurrency(emi)}.`;
    }
    speakPrompt(readText);
  });

  recalculateLoan();
};

// ----------------------------------------------------
// 12. VIEW 11: AADHAAR BIOMETRIC VAULT LOCKER
// ----------------------------------------------------
const initVaultLocker = () => {
  const pinReadout = document.getElementById('pin-readout');
  const clearBtn = document.getElementById('btn-pin-clear');
  const enterBtn = document.getElementById('btn-pin-enter');
  const pinDigits = document.querySelectorAll('.pin-grid button:not(.btn-clear):not(.btn-enter)');
  
  const scanContainer = document.getElementById('vault-scanner-container');
  const scanBtn = document.getElementById('btn-vault-scan');
  const scanLabel = document.getElementById('vault-scanner-label');

  const updatePinDisplay = () => {
    const length = state.locker.buffer.length;
    pinReadout.innerText = length === 0 ? '----' : '*'.repeat(length);
  };

  pinDigits.forEach(b => {
    b.addEventListener('click', () => {
      if (state.locker.buffer.length < 4) {
        state.locker.buffer += b.getAttribute('data-val');
        updatePinDisplay();
      }
    });
  });

  clearBtn.addEventListener('click', () => {
    state.locker.buffer = '';
    updatePinDisplay();
    scanContainer.classList.add('disabled');
    scanBtn.disabled = true;
    state.locker.pinVerified = false;
    scanLabel.innerText = 'Awaiting PIN Code Verification...';
  });

  const btnSpeakVault = document.getElementById('btn-speak-vault');
  if (btnSpeakVault) {
    btnSpeakVault.addEventListener('click', () => {
      let vaultDetails = `Locker status: Safe deposit vault locker is currently ${state.locker.status === 'UNLOCKED' ? 'UNLOCKED and accessible' : 'LOCKED and secured'}. `;
      if (state.locker.pinVerified) {
        vaultDetails += "Passcode verified. Scan thumb biometrics to unlock.";
      } else {
        vaultDetails += "Requires passcode PIN verify first.";
      }
      speakPrompt(vaultDetails);
    });
  }

  // Validate Code PIN
  enterBtn.addEventListener('click', () => {
    if (state.locker.buffer === state.locker.pinCode) {
      state.locker.pinVerified = true;
      scanContainer.classList.remove('disabled');
      scanBtn.disabled = false;
      scanLabel.innerText = 'PIN OK. Scan biometrics to toggle lock state.';
      logEvent('VAULT', 'Locker access: PIN validated successfully. Scanner active.');
    } else {
      state.locker.buffer = '';
      updatePinDisplay();
      scanContainer.classList.add('disabled');
      scanBtn.disabled = true;
      state.locker.pinVerified = false;
      scanLabel.innerText = 'INVALID PIN. SECURITY BLOCKED.';
      logEvent('SECURITY', 'Locker access failure: Invalid PIN entry attempt.');
    }
  });

  // Scan biometric to toggle status
  scanBtn.addEventListener('click', () => {
    if (!state.locker.pinVerified) return;

    scanBtn.classList.add('scanning');
    scanBtn.disabled = true;
    scanLabel.innerText = 'Authenticating fingerprint token...';

    setTimeout(() => {
      scanBtn.classList.remove('scanning');
      
      const graphic = document.getElementById('vault-graphic');
      const badgeTop = document.getElementById('vault-top-badge');
      const labelText = document.getElementById('vault-status-indicator-text');
      const accessLvl = document.getElementById('vault-access-level');
      
      const badgeDash = document.getElementById('badge-dash-vault');
      const dotDash = document.getElementById('dot-dash-vault');
      const badgeSidebar = document.getElementById('badge-vault-status');

      if (state.locker.status === 'LOCKED') {
        state.locker.status = 'UNLOCKED';
        graphic.classList.add('unlocked');
        
        labelText.innerText = 'SAFE LOCKER UNLOCKED 🔓';
        labelText.className = 'status-overlay-text text-green font-orbitron';
        
        badgeTop.innerText = 'VAULT ACCESS ACTIVE';
        badgeTop.className = 'badge badge-green';
        
        accessLvl.innerText = 'AUTHORIZED';
        accessLvl.className = 'text-green font-mono';

        badgeDash.innerText = 'VAULT UNLOCKED';
        if (dotDash) dotDash.className = 'status-dot green';

        badgeSidebar.innerText = 'UNLOCKED';
        badgeSidebar.className = 'badge badge-green sidebar-badge';

        logEvent('VAULT', 'Locker access: Safe deposit locker vaults UNLOCKED.');
      } else {
        state.locker.status = 'LOCKED';
        graphic.classList.remove('unlocked');
        
        labelText.innerText = 'VAULT LOCKED 🔒';
        labelText.className = 'status-overlay-text text-red font-orbitron';
        
        badgeTop.innerText = 'VAULT LOCKED';
        badgeTop.className = 'badge badge-red';
        
        accessLvl.innerText = 'UNAUTHORIZED';
        accessLvl.className = 'text-red font-mono';

        badgeDash.innerText = 'VAULT LOCKED';
        if (dotDash) dotDash.className = 'status-dot red';

        badgeSidebar.innerText = 'LOCKED';
        badgeSidebar.className = 'badge badge-red sidebar-badge';

        logEvent('VAULT', 'Locker access: Safe deposit locker vaults LOCKED.');
      }

      // Reset PINpad buffer
      state.locker.buffer = '';
      state.locker.pinVerified = false;
      updatePinDisplay();
      scanContainer.classList.add('disabled');
      scanLabel.innerText = 'Awaiting PIN Code Verification...';

    }, 2000);
  });
};

// ----------------------------------------------------
// 13. BALANCE EDITOR & TELEMETRY CLOCK
// ----------------------------------------------------
const initBalanceEditor = () => {
  const trigger = document.getElementById('balance-card-trigger');
  const editContainer = document.getElementById('balance-input-container');
  const directInput = document.getElementById('balance-direct-input');
  const saveBtn = document.getElementById('btn-save-balance');

  trigger.addEventListener('click', (e) => {
    // If input is visible, don't trigger toggle again when clicking elements inside
    if (!editContainer.classList.contains('hidden') && e.target !== trigger) {
      return;
    }
    
    // Toggle input display
    editContainer.classList.remove('hidden');
    directInput.value = state.user.balance;
    directInput.focus();
  });

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const newBal = parseFloat(directInput.value);
    if (!isNaN(newBal) && newBal >= 0) {
      const oldBal = state.user.balance;
      state.user.balance = newBal;
      updateMetricsDOM();
      
      logEvent('SYSTEM', `Account balance updated: ${formatCurrency(oldBal)} to ${formatCurrency(newBal)}.`);
      speakPrompt(`Account balance modified to ${formatCurrency(newBal)}.`);
    }
    editContainer.classList.add('hidden');
  });

  // Handle clicking outside balance editor to close it
  document.addEventListener('click', (e) => {
    if (!trigger.contains(e.target)) {
      editContainer.classList.add('hidden');
    }
  });
};

const initChatbot = () => {
  const form = document.getElementById('chatbot-form');
  const input = document.getElementById('chat-input');
  const btnSpeakChat = document.getElementById('btn-speak-chat');

  if (btnSpeakChat) {
    btnSpeakChat.addEventListener('click', () => {
      if (state.speech.lastChatResponse) {
        speakPrompt(state.speech.lastChatResponse);
      }
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (query) {
      processChatbotQuery(query);
      input.value = '';
    }
  });

  // Chat Suggestion Chips
  const chips = document.querySelectorAll('.suggest-chip');
  chips.forEach(c => {
    c.addEventListener('click', () => {
      const q = c.getAttribute('data-query');
      processChatbotQuery(q);
    });
  });
};

const initVoiceController = () => {
  const muteBtn = document.getElementById('btn-global-mute');
  const stopBtn = document.getElementById('btn-floating-stop');

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      state.speech.muted = !state.speech.muted;
      if (state.speech.muted) {
        muteBtn.innerHTML = '<span class="toggle-icon">🔇</span> Voice: OFF';
        muteBtn.classList.add('muted');
        
        // STRICT RULE: Cancel speech on mute
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        if (stopBtn) stopBtn.classList.add('hidden');
        state.speech.active = false;
        logEvent('SYSTEM', 'Voice assistant synthesis muted globally.');
      } else {
        muteBtn.innerHTML = '<span class="toggle-icon">🔊</span> Voice: ON';
        muteBtn.classList.remove('muted');
        logEvent('SYSTEM', 'Voice assistant synthesis unmuted globally.');
      }
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      stopBtn.classList.add('hidden');
      state.speech.active = false;
      logEvent('SYSTEM', 'Acoustic synthesis manually stopped.');
    });
  }
};

const startSystemClock = () => {
  const clock = document.getElementById('dashboard-clock');
  setInterval(() => {
    if (clock) {
      clock.innerText = getTimestamp();
    }
  }, 1000);
};

// ----------------------------------------------------
// 14. BOOTSTRAP INITIALIZATION
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initSpeechEngine();
  initNavigation();
  initVoiceController();
  initOnboarding();
  initDoorsSystem();
  initVoiceHub();
  initChatbot();
  initTaxationEngine();
  initMicroTaxEngine();
  initPortfolioAdvisor();
  initLoanSystem();
  initVaultLocker();
  initBalanceEditor();
  startSystemClock();
});
