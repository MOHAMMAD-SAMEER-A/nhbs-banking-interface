/**
 * NHBS - Non-Human Banking System
 * Core Application Logic & State Controller
 * HackFusion 2026 | Byte Builders
 */

// ----------------------------------------------------
// 1. APPLICATION STATE
// ----------------------------------------------------
const state = {
  user: {
    name: '',
    account: '',
    bank: '',
    branch: '',
    pan: '',
    taxFramework: 'A', // 'A' (Annual Return) or 'B' (Continuous Micro-Tax)
    verified: false,
    authToken: '',
    balance: 100000.00,
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
    voices: []
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
    // Clear initial empty text if present
    if (state.auditLogs.length === 1 && body.innerHTML.includes('System Default')) {
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

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const lang = customLang || state.speech.lang;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;

  // Find a matching voice for the target locale
  const matchingVoice = state.speech.voices.find(v => v.lang.startsWith(lang.split('-')[0]));
  if (matchingVoice) {
    utterance.voice = matchingVoice;
  }

  // Animation triggers on waveform
  const waveform = document.getElementById('waveform');
  const statusText = document.getElementById('voice-wave-status');

  utterance.onstart = () => {
    if (waveform) waveform.classList.add('speaking');
    if (statusText) statusText.innerText = `ASSISTANT SPEAKING (${LANG_NAMES[lang]})`;
  };

  utterance.onend = () => {
    if (waveform) waveform.classList.remove('speaking');
    if (statusText) statusText.innerText = 'ASSISTANT IDLE';
  };

  utterance.onerror = () => {
    if (waveform) waveform.classList.remove('speaking');
    if (statusText) statusText.innerText = 'ASSISTANT IDLE';
  };

  window.speechSynthesis.speak(utterance);
};

// ----------------------------------------------------
// 4. VIEW ROUTER & NAVIGATION
// ----------------------------------------------------
const switchTab = (tabId) => {
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

  logEvent('SYSTEM', `UI routed to panel: ${tabId.toUpperCase()}`);
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
// 5. VIEW 1: CUSTOMER ONBOARDING & SCANNER
// ----------------------------------------------------
const initOnboarding = () => {
  const form = document.getElementById('onboarding-form');
  const scanBtn = document.getElementById('biometric-scanner-btn');
  const statusMsg = document.getElementById('onboarding-status');

  scanBtn.addEventListener('click', () => {
    // Validate the input fields using native HTML validation
    if (!form.reportValidity()) {
      statusMsg.innerText = 'Onboarding parameters invalid. Provide all credentials.';
      statusMsg.className = 'status-msg error';
      speakPrompt('Please enter valid onboarding details before scanning.');
      return;
    }

    // Enter scanning visual state
    scanBtn.classList.add('scanning');
    scanBtn.disabled = true;
    statusMsg.innerText = 'Initializing Aadhaar gateway. Validating biometric fingerprints...';
    statusMsg.className = 'status-msg';

    speakPrompt('Fingerprint scanning in progress. Verifying with secure biometric core.');

    // Simulated network authentication lag
    setTimeout(() => {
      // PAN validation occurs inside form validity check.
      // Generate synthetic verification token
      const randomHex = Math.floor(Math.random() * 65535).toString(16).toUpperCase();
      const syntheticToken = `[Aadhaar_Auth_Token_Verified_NHBS2026_${randomHex}]`;

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
      statusMsg.innerText = 'Biometrics authenticated! Gateway entrance unlocked.';
      statusMsg.className = 'status-msg success';

      logEvent('SECURITY', `Synthetic Biometric Token issued: ${syntheticToken}`);
      
      // Physically open sliding doors
      updateDoorsState('OPEN');

      // Proceed to View 2 Modal
      setTimeout(() => {
        const modal = document.getElementById('tax-framework-modal');
        if (modal) {
          modal.showModal();
          speakPrompt('Authentication successful. Please select your tax operational mode to secure access.');
        }
      }, 1500);

    }, 2500);
  });

  // Modal confirm action
  const confirmTaxBtn = document.getElementById('confirm-tax-framework-btn');
  confirmTaxBtn.addEventListener('click', () => {
    const selectedMode = document.querySelector('input[name="tax-mode-selection"]:checked').value;
    state.user.taxFramework = selectedMode;

    // Synchronize state values into DOM
    document.getElementById('card-name').innerText = state.user.name;
    document.getElementById('card-account').innerText = state.user.account;
    document.getElementById('card-bank').innerText = state.user.bank;
    document.getElementById('card-branch').innerText = state.user.branch;
    document.getElementById('card-pan').innerText = state.user.pan;
    document.getElementById('card-tax-mode').innerText = selectedMode === 'A' ? 'OPTION A (Manual AI Filing)' : 'OPTION B (Automated Micro-Tax)';

    // Update top bar values
    document.getElementById('top-bar-name').innerText = state.user.name;
    document.getElementById('top-bar-auth-token').innerText = `Synthetic Token: ${state.user.authToken}`;
    document.getElementById('metric-tax-mode').innerText = selectedMode === 'A' ? 'OPTION A' : 'OPTION B';
    
    const taxBadge = document.getElementById('badge-tax-view-mode');
    if (selectedMode === 'B') {
      taxBadge.innerText = 'AUTOMATED ENGINE ACTIVE';
      taxBadge.className = 'badge badge-green';
    } else {
      taxBadge.innerText = 'ANNUAL MANUAL FILING ACTIVE';
      taxBadge.className = 'badge badge-yellow';
    }

    // Sync receipt preview form values
    document.getElementById('receipt-pan').innerText = state.user.pan;
    document.getElementById('receipt-token').innerText = state.user.authToken;

    // Write initial log
    logEvent('SECURITY', `Access granted to user ${state.user.name}. Gateway doors established.`);
    logEvent('TAX', `Framework set to Mode Option ${selectedMode}. Engine synchronized.`);

    // Hide onboarding screens
    const modal = document.getElementById('tax-framework-modal');
    modal.close();
    
    document.getElementById('onboarding-overlay').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');

    // Welcome vocal speech greeting
    const welcomeSpeech = `Welcome ${state.user.name} to the Non Human Banking System. Your credentials have been verified using synthetic tokenization. The system branch is online and operational.`;
    speakPrompt(welcomeSpeech);

    // Default route to dashboard
    switchTab('dashboard');
  });

  // Modal dialog light dismiss fallback for browsers lacking native support
  const modal = document.getElementById('tax-framework-modal');
  if (modal && !('closedBy' in HTMLDialogElement.prototype)) {
    modal.addEventListener('click', (event) => {
      if (event.target !== modal) return;
      const rect = modal.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isDialogContent) {
        modal.close();
      }
    });
  }
};

// ----------------------------------------------------
// 6. VIEW 4: AUTOMATIC DOOR SYSTEM & HARDWARE TELEMETRY
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
    btn.innerText = 'TRIGGER DOOR CLOSE';
    btn.className = 'btn btn-green';
    statusOverlay.innerText = 'GATE OPEN (PROCEED)';
    statusOverlay.className = 'door-overlay-status text-green';
    
    dashBadge.innerText = 'DOORS OPEN';
    const dashDot = document.getElementById('dot-dash-door-active');
    if (dashDot) dashDot.className = 'status-dot green';

    navBadge.innerText = 'UNLOCKED';
    navBadge.className = 'badge badge-green sidebar-badge';

    telemLaser.innerText = 'DEACTIVATED';
    telemLaser.className = 'telemetry-val text-green';

    logEvent('SECURITY', 'Entrance gates physically OPENED. Security lasers deactivated.');
  } else {
    frame.classList.remove('open');
    btn.innerText = 'TRIGGER DOOR OPEN';
    btn.className = 'btn btn-red';
    statusOverlay.innerText = 'SECURE GATE LOCKED';
    statusOverlay.className = 'door-overlay-status text-red';
    
    dashBadge.innerText = 'DOORS CLOSED';
    const dashDot = document.getElementById('dot-dash-door-active');
    if (dashDot) dashDot.className = 'status-dot red';

    navBadge.innerText = 'SECURE';
    navBadge.className = 'badge badge-accent sidebar-badge';

    telemLaser.innerText = 'ACTIVE (HIGH VOLTAGE)';
    telemLaser.className = 'telemetry-val text-red';

    logEvent('SECURITY', 'Entrance gates physically LOCKED. Security lasers activated.');
  }
};

const initDoorsSystem = () => {
  const btn = document.getElementById('btn-toggle-door');
  btn.addEventListener('click', () => {
    if (state.doorStatus === 'CLOSED') {
      updateDoorsState('OPEN');
      speakPrompt('Entrance gates opened. Please pass through.');
    } else {
      updateDoorsState('CLOSED');
      speakPrompt('Entrance gates closed and secured. Lasers active.');
    }
  });

  // Simple automated telemetry logs simulation
  setInterval(() => {
    if (!state.user.verified) return;
    const sensors = ['Optical beam aligns correct', 'Pressure threshold 420 Bar nominal', 'Infrared grid locked', 'Locker circuit secure'];
    const selected = sensors[Math.floor(Math.random() * sensors.length)];
    const logBox = document.getElementById('sensor-telemetry-logs');
    if (logBox) {
      const item = document.createElement('div');
      item.className = 'sensor-log-item';
      item.innerHTML = `<span class="log-time">[${getTimestamp().split(' ')[1]}]</span> SENSOR TELEM: ${selected}`;
      logBox.appendChild(item);
      logBox.scrollTop = logBox.scrollHeight;
    }
  }, 8000);
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
    logEvent('SYSTEM', `Assistant vocal language switched to: ${state.speech.lang}`);
    speakPrompt(`Assistant language configured to ${LANG_NAMES[state.speech.lang]}`, state.speech.lang);
  });

  // Trigger manual speech translation
  triggerBtn.addEventListener('click', () => {
    const text = customTxt.value.trim();
    if (text) {
      speakPrompt(text);
      logEvent('SYSTEM', `Custom text synthesized: "${text}"`);
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
      logEvent('SYSTEM', `Preset text synthesized: "${promptText}"`);
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

  // 1. Render User Message
  const userRow = document.createElement('div');
  userRow.className = 'chat-message user-msg';
  userRow.innerHTML = `<p>${query}</p><span class="message-time">${getTimestamp().split(' ')[1]}</span>`;
  chatHistory.appendChild(userRow);

  // Intent classification logic (regular expression pattern matching)
  let intent = 'UNKNOWN';
  let responseText = '';
  let targetTab = null;

  const q = query.toLowerCase();

  if (/\btax\b|\bfile\b|\bitr\b|\bdeduct\b|\bincome\b|\bgst\b/i.test(q)) {
    intent = 'TAXATION_LEDGER_STREAM';
    responseText = 'I have identified your request for tax management processes. Transitioning you to the Tax & GST Rule Engine console.';
    targetTab = 'taxation';
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
    botRow.innerHTML = `<p>${responseText}</p><span class="message-time">${getTimestamp().split(' ')[1]}</span>`;
    chatHistory.appendChild(botRow);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    speakPrompt(responseText);
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
};

const initTaxationEngine = () => {
  // File annual tax returns under Option A
  const btnFile = document.getElementById('btn-file-tax-return');
  btnFile.addEventListener('click', () => {
    const taxAmount = 322500.00;

    if (state.user.balance < taxAmount) {
      speakPrompt('Insufficient account balance to settle annual tax liabilities.');
      logEvent('TAX', 'ITR Return Filing Failure: Insufficient capital funds.');
      alert('Error: Insufficient balance to pay annual tax return.');
      return;
    }

    // Debit balance, increment pool
    state.user.balance -= taxAmount;
    state.user.taxPaid += taxAmount;
    updateMetricsDOM();

    // Generate random Receipt number
    const randomHex = Math.floor(1000 + Math.random() * 8999);
    const receiptNum = `#ITR-2026-NHBS-${randomHex}`;

    // Update receipt box
    document.getElementById('receipt-id').innerText = receiptNum;
    document.getElementById('receipt-amount').innerText = formatCurrency(taxAmount);
    document.getElementById('itr-receipt-container').classList.remove('hidden');

    speakPrompt(`Annual income tax return filed successfully. Liability of ${formatCurrency(taxAmount)} settled. Receipt generated.`);
    logEvent('TAX', `ITR return filed successfully. ID: ${receiptNum}. Settle amount: ${formatCurrency(taxAmount)}.`);
  });

  // Spending Simulator button click bindings
  const spendBtns = document.querySelectorAll('.spend-btn');
  const simLedger = document.getElementById('sim-transaction-ledger');

  spendBtns.forEach(b => {
    b.addEventListener('click', () => {
      const category = b.getAttribute('data-category'); // 'Luxury', 'Service', 'Essential'
      const amount = parseFloat(b.getAttribute('data-amount'));
      const item = b.getAttribute('data-item');

      let gstRate = 0;
      if (category === 'Luxury') gstRate = 0.28;
      if (category === 'Service') gstRate = 0.18;
      if (category === 'Essential') gstRate = 0.05;

      const computedGst = amount * gstRate;
      const totalDebit = amount + computedGst;

      if (state.user.balance < totalDebit) {
        speakPrompt('Transaction declined. Capital base insufficient.');
        logEvent('TRANSACTION', `Declined simulator spend on ${item}. Balance low.`);
        return;
      }

      // Check tax operational mode selected at onboarding
      const mode = state.user.taxFramework;

      let logMessage = '';
      if (mode === 'B') {
        // Continuous debit: charges base + tax automatically
        state.user.balance -= totalDebit;
        state.user.taxPaid += computedGst;
        updateMetricsDOM();

        logMessage = `Spent ${formatCurrency(amount)} + Micro-Tax ${formatCurrency(computedGst)} (GST ${gstRate*100}%). Debited.`;
        logEvent('TRANSACTION', `Micro-Tax Engine continuous debit applied. Item: ${item}. Debited ${formatCurrency(totalDebit)}.`);
        speakPrompt(`Transaction approved. Debited ${formatCurrency(totalDebit)} including ${gstRate*100} percent continuous GST.`);
      } else {
        // Option A: manual return debits base cost only, caches tax
        state.user.balance -= amount;
        updateMetricsDOM();

        logMessage = `Spent ${formatCurrency(amount)}. Deferred Tax ${formatCurrency(computedGst)} (GST ${gstRate*100}%).`;
        logEvent('TRANSACTION', `Transaction approved. Option A rules. Item: ${item}. Debited ${formatCurrency(amount)}. GST deferred.`);
        speakPrompt(`Transaction approved. Debited ${formatCurrency(amount)}. GST tax liability cached for annual file.`);
      }

      // Render log line in simulator view
      if (simLedger.innerHTML.includes('No simulated transactions')) {
        simLedger.innerHTML = '';
      }

      const logRow = document.createElement('div');
      logRow.className = 'ledger-transaction-item';
      logRow.innerHTML = `
        <span>[${category}] ${item}</span>
        <strong>${logMessage}</strong>
      `;
      simLedger.appendChild(logRow);
      simLedger.scrollTop = simLedger.scrollHeight;
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

    // Trigger visual reflow for transitions
    document.getElementById('portfolio-fd-fill').style.width = '40%';
    document.getElementById('portfolio-sgb-fill').style.width = '30%';
    document.getElementById('portfolio-index-fill').style.width = '30%';
  };

  btnGenerate.addEventListener('click', () => {
    const split = calculateSplit();
    if (split) {
      updatePortfolioUI(split);
      
      const audioText = `AI optimization complete. Monthly capital of ${formatCurrency(split.savings)} has been allocated into our three tier risk hedged asset portfolio. Fixed Deposits forty percent at ${formatCurrency(split.fd)}. Sovereign Gold Bonds thirty percent at ${formatCurrency(split.sgb)}. Index Mutual Funds thirty percent at ${formatCurrency(split.mutual)}.`;
      speakPrompt(audioText);
      logEvent('SYSTEM', `Wealth advisor optimized allocation split generated on capital: ${formatCurrency(split.savings)}.`);
    }
  });

  btnListen.addEventListener('click', () => {
    const split = calculateSplit();
    if (split) {
      const audioText = `Heuristic investment model recommendation: Allocate ${formatCurrency(split.fd)} in secure fixed deposits. Assign ${formatCurrency(split.sgb)} in inflation resistant gold bonds. Position remaining ${formatCurrency(split.mutual)} in market index mutual funds for maximum compound growth.`;
      speakPrompt(audioText);
    }
  });
};

// ----------------------------------------------------
// 11. VIEW 10: AADHAAR BIOMETRIC VAULT LOCKER
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
    if (length === 0) {
      pinReadout.innerText = '----';
    } else {
      pinReadout.innerText = '*'.repeat(length);
    }
  };

  // Bind number digit clicks
  pinDigits.forEach(b => {
    b.addEventListener('click', () => {
      if (state.locker.buffer.length < 4) {
        state.locker.buffer += b.getAttribute('data-val');
        updatePinDisplay();
      }
    });
  });

  // Clear buffer
  clearBtn.addEventListener('click', () => {
    state.locker.buffer = '';
    updatePinDisplay();
    scanContainer.classList.add('disabled');
    scanBtn.disabled = true;
    state.locker.pinVerified = false;
    scanLabel.innerText = 'Awaiting PIN Code Verification...';
  });

  // Validate Code
  enterBtn.addEventListener('click', () => {
    if (state.locker.buffer === state.locker.pinCode) {
      state.locker.pinVerified = true;
      scanContainer.classList.remove('disabled');
      scanBtn.disabled = false;
      scanLabel.innerText = 'PIN OK. Touch fingerprint scanner to open.';
      speakPrompt('PIN authentication accepted. Touch biological reader to verify credential owner.');
      logEvent('VAULT', 'Locker access: PIN authentication match verified. Gateway scanner enabled.');
    } else {
      state.locker.buffer = '';
      updatePinDisplay();
      scanContainer.classList.add('disabled');
      scanBtn.disabled = true;
      state.locker.pinVerified = false;
      scanLabel.innerText = 'INVALID PASSCODE. ACCESS DENIED.';
      
      speakPrompt('Access denied. Security passcode failure.');
      logEvent('SECURITY', 'Locker access alert: Invalid vault passcode attempt recorded.');
    }
  });

  // Biometric touch trigger toggles lock status
  scanBtn.addEventListener('click', () => {
    if (!state.locker.pinVerified) return;

    scanBtn.classList.add('scanning');
    scanBtn.disabled = true;
    scanLabel.innerText = 'Validating locker access token key...';

    speakPrompt('Reading primary biometric credential template.');

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
        
        labelText.innerText = 'VAULT DOORS OPEN';
        labelText.className = 'status-overlay-text text-green font-orbitron';
        
        badgeTop.innerText = 'UNLOCKED ACCESS ACTIVE';
        badgeTop.className = 'badge badge-green';
        
        accessLvl.innerText = 'AUTHORIZED';
        accessLvl.className = 'text-green';

        badgeDash.innerText = 'LOCKER UNLOCKED';
        if (dotDash) dotDash.className = 'status-dot green';

        badgeSidebar.innerText = 'OPEN';
        badgeSidebar.className = 'badge badge-green sidebar-badge';

        speakPrompt('Access authorized. Safe deposit locker has been unlocked. Complete your operations.');
        logEvent('VAULT', 'Vault Locker Access: Physical security lockers UNLOCKED. Token session active.');
      } else {
        state.locker.status = 'LOCKED';
        graphic.classList.remove('unlocked');
        
        labelText.innerText = 'SECURE LOCKS ACTIVE';
        labelText.className = 'status-overlay-text text-red font-orbitron';
        
        badgeTop.innerText = 'SECURED LOCKOUT ACTIVE';
        badgeTop.className = 'badge badge-red';
        
        accessLvl.innerText = 'UNAUTHORIZED';
        accessLvl.className = 'text-red';

        badgeDash.innerText = 'SECURELY LOCKED';
        if (dotDash) dotDash.className = 'status-dot red';

        badgeSidebar.innerText = 'LOCKED';
        badgeSidebar.className = 'badge badge-red sidebar-badge';

        speakPrompt('Access terminated. Locker secure locking systems engaged.');
        logEvent('VAULT', 'Vault Locker Access: Security locks engaged. Safe deposit locker LOCKED.');
      }

      // Reset PIN flow
      state.locker.buffer = '';
      state.locker.pinVerified = false;
      updatePinDisplay();
      scanContainer.classList.add('disabled');
      scanLabel.innerText = 'Awaiting PIN Code Verification...';

    }, 2000);
  });
};

// ----------------------------------------------------
// 12. CHATBOT AND CLOCK SCHEDULERS
// ----------------------------------------------------
const initChatbot = () => {
  const form = document.getElementById('chatbot-form');
  const input = document.getElementById('chat-input');

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

const startSystemClock = () => {
  const clock = document.getElementById('dashboard-clock');
  setInterval(() => {
    if (clock) {
      clock.innerText = getTimestamp();
    }
  }, 1000);
};

// ----------------------------------------------------
// 13. BOOTSTRAP INITIALIZATION
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initSpeechEngine();
  initNavigation();
  initOnboarding();
  initDoorsSystem();
  initVoiceHub();
  initChatbot();
  initTaxationEngine();
  initPortfolioAdvisor();
  initVaultLocker();
  startSystemClock();
});
