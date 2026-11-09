export const translations = {
  en: {
    // Header & Meta
    badge: "Community Discovery Protocol",
    navMethod: "Our approach",
    navVisit: "Business visit",
    eyebrow: "FIELD INQUIRY · LOCAL BUSINESS LANDSCAPE",
      heroTitlePrefix: "Every business has a world behind it.",
    heroTitleEmphasis: "Start by listening.",
    heroSubtitle:
      "A human-first discovery experience for young people to sit alongside local business owners, understand daily operational friction, and map real problems before proposing any solution.",
    heroCtaPrimary: "Start Business Visit",
    heroCtaSecondary: "Understand the Method",
    heroPill1: "No Sales Pitch",
    heroPill2: "Phone-First Workflow",
    heroPill3: "Community Grounded",
    activeLens: "● ACTIVE LENS",
    inspectLens: "○ TAP TO EXAMINE",
    surfaceCaption: "What a visitor might notice",
    realityCaption: "A situation to explore together",
    examplesLabel: "Illustrative areas to explore:",
    fieldStep: "VISIT STEP",
    immediateStatus: "CURRENT VISIT",
    capturedLabel: "CAPTURED IN THIS VISIT",
    goToStep: "Go to step {step}",
    sceneKicker: "01 / A neighborhood, in motion",
    sceneTitle: "A living ecosystem",
    sceneBody: "People, paper, messages and the everyday work between them.",
    sceneExplore: "Explore the scene",
    sceneStatic: "Static scene",
    sceneDrag: "Drag to look around",
    sceneAlt: "Interactive 3D miniature of a neighborhood business",
    operationalCheck: "OPERATIONAL SCENARIO",
    researchHorizon: "FUTURE RESEARCH HORIZON",

    // Narrative Section A: Every business has a story
    sectionA: {
      eyebrow: "01 · THE INVISIBLE WEIGHT",
      title: "Behind every counter is a complex daily ecosystem.",
      lead: "Local businesses are not abstract systems. They are living networks of phone notifications, handwritten notes, language gaps, and relentless multitasking.",
      description1:
        "A visitor may see a simple storefront. They may not see the messages waiting between customers, the bookings copied across calendars, or the handwritten notes that keep a busy day moving. These are illustrative situations, not claims about any particular business.",
      description2:
        "Our mission begins with humility: we do not arrive with software to sell. We arrive with open ears to discover where real time is lost and where owners carry unnecessary burdens.",
      stat1Number: "1 phone",
      stat1Label: "All you need to complete the discovery together",
      stat2Number: "Listen",
      stat2Label: "Let the owner set the pace of the conversation",
      stat3Number: "No pitch",
      stat3Label: "Discovery comes before any proposed solution",
    },

    // Narrative Section B: Look Closer (Interactive operational lenses)
    sectionB: {
      eyebrow: "02 · LOOK CLOSER",
      title: "Where daily friction hides in plain sight.",
      subtitle:
        "Tap each operational lens to reveal what casual visitors see versus what the owner actually wrestles with every single day.",
      toggleViewSurface: "What Visitors See",
      toggleViewReality: "What the Owner Faces",
      lenses: [
        {
          id: "whatsapp",
          tag: "COMMUNICATIONS",
          title: "Messages between customers",
          surface: "A customer casually sends a message expecting instant replies about prices, directions, and availability.",
          reality:
            "An owner may be switching between serving people in person and answering messages, making it hard to keep track of which questions still need a reply.",
          focalPoints: ["Questions waiting for a reply", "Context switching during service", "Repeating the same details"],
        },
        {
          id: "ledger",
          tag: "OPERATIONS",
          title: "Notes across a working day",
          surface: "A neat notebook resting beside the cash register gives a rustic, authentic community impression.",
          reality:
            "When information lives in several notebooks or loose pages, finding an earlier note can take time and two people may not know which record is current.",
          focalPoints: ["Finding an earlier note", "Keeping records in sync", "Passing information between shifts"],
        },
        {
          id: "language",
          tag: "INTERACTIONS",
          title: "A language gap at the counter",
          surface: "Smiles and hand gestures bridge casual interactions at the counter.",
          reality:
            "Dietary restrictions, custom requests, and emergency directions get miscommunicated. International travelers walk past because signs and menus are only partially translated.",
          focalPoints: ["Misunderstood food allergies", "Awkward pricing clarifications", "Reluctance to ask questions"],
        },
        {
          id: "bookings",
          tag: "COORDINATION",
          title: "Bookings in more than one place",
          surface: "Guests assume modern reservation platforms synchronize seamlessly with calendar apps.",
          reality:
            "When bookings arrive through different channels, an owner may have to compare messages and a calendar before confirming availability.",
          focalPoints: ["Checking several channels", "Updating a shared calendar", "Confirming availability"],
        },
      ],
    },

    // Narrative Section C: Listen before suggesting
    sectionC: {
      eyebrow: "03 · PHILOSOPHY OF INQUIRY",
      title: "Listen before designing. Discover before building.",
      lead: "When we arrive with answers already chosen, we risk missing the problem that matters to the owner.",
      pillars: [
        {
          num: "I",
          title: "Humble Observation",
          desc: "We do not claim to know the business better than the owner who has sustained it for years. We observe existing habits without judgment.",
        },
        {
          num: "II",
          title: "Tool Reality Mapping",
          desc: "A spreadsheet is only as good as the time available to enter data. We record what tools are genuinely used, including worn paper notebooks.",
        },
        {
          num: "III",
          title: "Friction Over Features",
          desc: "We ask where repeated work takes time or interrupts the service the owner wants to give.",
        },
        {
          num: "IV",
          title: "Zero Sales Coercion",
          desc: "Never ask for money, never quote software costs, never pitch an agency retainer. True research requires absolute trust.",
        },
      ],
    },

    // Narrative Section D: Community-first Field Visit
    sectionD: {
      eyebrow: "04 · COMMUNITY-FIRST METHOD",
      title: "How to conduct a meaningful business visit.",
      lead: "Each visit must be conducted by someone who has a natural relationship with the owner—a neighbor, relative, regular customer, or local friend.",
      steps: [
        {
          step: "01",
          heading: "Choose a Business You Know",
          text: "Never walk into a stranger's shop cold. Visit the warung you eat lunch at, the homestay run by your neighbor, or your friend's dive shop.",
        },
        {
          step: "02",
          heading: "Sit Together With One Phone",
          text: "Hold the phone so both of you can see the screen. Read questions aloud naturally like a shared conversation, not an interrogation.",
        },
        {
          step: "03",
          heading: "Quote the Owner Directly",
          text: "When asking about operational pain, record the owner's exact vernacular and frustration. Do not sanitize their real words into corporate jargon.",
        },
        {
          step: "04",
          heading: "Respect Contact Privacy",
          text: "Only collect a WhatsApp contact if the owner explicitly invites continued conversation. Never force or pre-check consent.",
        },
      ],
    },

    // Form Section
    formSection: {
      eyebrow: "THE DISCOVERY WORKSPACE",
      title: "Document a Business Visit",
      subtitle:
        "Complete this guided questionnaire together on one mobile phone. Progress saves automatically on this device so nothing is lost if your connection drops.",
      stepCounter: "Step {current} of {total}",
      viewModes: {
        stepByStep: "Guided Mode",
        allQuestions: "Expansive Mode",
      },
      draftBadgeSaved: "Draft saved on device",
      draftBadgeOffline: "Working offline · Local draft active",
      draftRestoredNotification: "Draft restored from your last visit session.",
      draftClearButton: "Reset Form",
      draftClearConfirm: "Are you sure you want to discard your draft? This cannot be undone.",

      // Step 1: Context & People
      step1: {
        badge: "01 / Context",
        title: "Who is taking part in this conversation?",
        desc: "Set the location and participants so we know the community setting.",
        pilotLocation: "Visit Location / Village",
        pilotLocationPlaceholder: "e.g. Nusa Lembongan, Bali",
        pilotLocationHint: "The island, town, or neighborhood where this business lives.",
        participantName: "Your Name (Interviewer)",
        participantNamePlaceholder: "e.g. Wayan Sudarta",
        participantNameHint: "Your name as a local youth or community researcher.",
        businessName: "Business Name",
        businessNamePlaceholder: "e.g. Warung Pantai Indah, Blue Wave Diving",
        businessNameHint: "The trade or public name of the shop, homestay, or stall.",
        businessType: "Business Type / Category",
        businessTypePlaceholder: "e.g. Homestay, Cafe, Scooter Rental, Dive Shop, Laundry",
        businessTypeHint: "What goods or services does this enterprise provide?",
      },

      // Step 2: Current Tools
      step2: {
        badge: "02 / Existing Tools",
        title: "What tools does the business currently rely on?",
        desc: "Select all that apply. Understand the tools already woven into their daily routine.",
        tools: {
          whatsapp: { label: "WhatsApp / Chat", sub: "For orders, bookings, customer inquiries, and vendor messages" },
          paper_records: { label: "Paper Records / Notebooks", sub: "Handwritten receipts, physical daybooks, wall calendars" },
          spreadsheets: { label: "Spreadsheets (Excel / Google)", sub: "Manual bookkeeping, inventory tracking, financial logs" },
          pos_system: { label: "POS / Cash Register", sub: "Digital cash register, card terminal, or point-of-sale software" },
          none: { label: "None / Pure Memory", sub: "No formal tracking; relying entirely on physical cash and memory" },
          other: { label: "Other Systems", sub: "Specialized booking engine, marketplace app, or custom workflow" },
        },
        toolsHint: "Notice: Selecting 'None' clears other selections to preserve accuracy.",
      },

      // Step 3: Problem Areas
      step3: {
        badge: "03 / Problem Areas",
        title: "Where do friction and stress occur most often?",
        desc: "Select all that apply. Where does the owner feel overwhelmed or bottlenecked?",
        problems: {
          tourist_replies: { label: "Replying to Tourists", sub: "Late night inquiries, price negotiations, repeated basic questions" },
          social_media: { label: "Social Media Maintenance", sub: "Creating content, posting updates, maintaining Instagram/TikTok presence" },
          bookings: { label: "Bookings & Reservations", sub: "Double bookings, calendar syncs, walk-in collisions, deposits" },
          translation: { label: "Language & Translation", sub: "Communicating menu items, dietary allergies, and customer requests" },
          other: { label: "Other Friction", sub: "Staff scheduling, supplier payments, tax compliance, or stockout issues" },
        },
        problemsHint: "Select any area the owner wants to talk about.",
      },

      // Step 4: In Their Own Words
      step4: {
        badge: "04 / Deep Inquiries",
        title: "What takes the most time or causes them to lose customers?",
        desc: "Ask the owner this exact question and listen without interrupting. Record their exact voice.",
        label: "The Owner's Core Operational Pain",
        placeholder:
          "For example: 'I keep switching between serving customers and checking messages. I worry I might miss a question.' Use the owner's own words; this example is illustrative.",
        hint: "Minimum 10 characters. Capture vivid specifics: numbers, times of day, and emotional weight.",
        charCount: "{count} / 2000 characters",
      },

      // Step 5: Frequency & Consent
      step5: {
        badge: "05 / Frequency & Continuity",
        title: "How often does this happen, and can we stay in touch?",
        desc: "Establish how chronic this pain is, and request follow-up contact strictly with explicit consent.",
        frequencyTitle: "How frequently does this operational pain occur?",
        frequency: {
          daily: { label: "Daily", sub: "An ongoing daily grind every single day" },
          weekly: { label: "Weekly", sub: "Happens several times across every week" },
          monthly: { label: "Monthly", sub: "Periodic headache during monthly reporting or spikes" },
          occasionally: { label: "Occasionally", sub: "Intermittent issue during peak seasons or holidays" },
          unsure: { label: "Not Sure", sub: "Uncertain or unpredictable occurrence" },
        },
        consentBoxTitle: "Optional Respectful Follow-Up",
        consentBoxDesc:
          "May we contact you about this visit and the problem you discussed? Sharing a WhatsApp number is optional.",
        consentLabel: "The business owner explicitly agrees to be contacted for a research follow-up.",
        consentNotice:
          "We will use this number only for follow-up about this visit. You can leave consent unchecked and continue without sharing contact details.",
        contactName: "Contact Person's Name",
        contactNamePlaceholder: "e.g. Ibu Ketut",
        whatsapp: "WhatsApp Phone Number",
        whatsappPlaceholder: "+62 812 3456 7890",
        whatsappHint: "Include country code (+62 for Indonesia).",
      },

      // Navigation & Submission
      buttons: {
        back: "Previous Step",
        next: "Next Step",
        submit: "Submit Business Visit",
        submitting: "Submitting to Protocol...",
        retry: "Retry Submission",
      },

      validationErrors: {
        step1Required: "Please complete the location, your name, business name, and business type.",
        toolsRequired: "Please select at least one tool currently used by the business.",
        problemsRequired: "Please select at least one problem area where the business faces friction.",
        painRequired: "Please describe the operational pain with at least 10 characters.",
        frequencyRequired: "Please indicate how often this problem occurs.",
        consentContactRequired: "When follow-up consent is granted, both contact person name and WhatsApp number are required.",
        genericRequired: "Please complete all required fields highlighted above before proceeding.",
      },

      // Submission Success State
      successState: {
        badge: "RECORDED TO ARCHIVE",
        title: "Business Visit Recorded.",
        lead: "The server confirmed receipt of this visit record. Contact details were included only if follow-up consent was given.",
        metaTitle: "Submission Verification",
        refLabel: "Submission UUID",
        businessLabel: "Business",
        typeLabel: "Classification",
        locationLabel: "Location",
        statusLabel: "Status",
        statusReceived: "Received · Queued for Evidence Review",
        note: "No commercial commitment was made. The business owner retains full autonomy over their information.",
        actionNew: "Record Another Business Visit",
        actionHome: "Return to Platform Home",
      },

      // Offline / Error messages
      networkNotice: {
        offlineTitle: "Offline Mode Active",
        offlineBody:
          "You are currently disconnected from the internet. Your visit draft is saved in this browser on this device. When you regain connection, tap 'Submit Business Visit' to send it.",
        submissionError:
          "Could not reach the submission server. Your draft remains completely intact on this phone. Check your mobile signal and try again.",
      },
    },

    // Narrative Section E: What happens after the visit
    sectionE: {
      eyebrow: "05 · THE HORIZON",
      title: "What happens to the discovered knowledge?",
      lead: "The visit preserves the business name and the problems the owner chose to discuss. That listening record is the only stage represented as active today.",
      immediateOutput: {
        title: "What this visit records",
        items: [
          "The business name, type and everyday tools the owner described.",
          "The problem areas and open-ended account captured during this conversation.",
          "Contact details only when the owner gives explicit follow-up consent.",
        ],
      },
      v3Roadmap: {
        title: "The Broader V3 Journey (Future Horizon)",
        note: "The following framework illustrates the broader exploratory research path. Only Step 1 (Listening & Discovery) is operational at this time.",
        steps: [
          { phase: "01", name: "Listen", status: "ACTIVE NOW", desc: "Sit with local owners. Map real pains using this discovery protocol." },
          { phase: "02", name: "Prioritise", status: "RESEARCH", desc: "Cluster shared problems across businesses to isolate high-leverage opportunities." },
          { phase: "03", name: "Train", status: "RESEARCH", desc: "Equip local youth with accessible digital workflows to address verified bottlenecks." },
          { phase: "04", name: "Demonstrate", status: "RESEARCH", desc: "Build zero-cost proof of concepts directly addressing the owner's pain." },
          { phase: "05", name: "Agree Scope", status: "RESEARCH", desc: "Transparent, modest, outcome-based terms without predatory agency retainers." },
          { phase: "06", name: "Deliver & Verify", status: "RESEARCH", desc: "Implement the digital tool, track time saved, and verify tangible improvement." },
          { phase: "07", name: "Learn & Iterate", status: "RESEARCH", desc: "Document the case study so other young people can replicate the workflow." },
        ],
      },
    },

    // Common
    languageToggle: "Bahasa",
    footerQuote: "Listen first. Understand before proposing a solution.",
  },

  id: {
    // Header & Meta
    badge: "Protokol Penemuan Komunitas",
    navMethod: "Cara kami",
    navVisit: "Kunjungan usaha",
    eyebrow: "RISET LAPANGAN · EKOSISTEM USAHA LOKAL",
    heroTitlePrefix: "Di balik setiap usaha ada sebuah dunia.",
    heroTitleEmphasis: "Mulailah dengan mendengarkan.",
    heroSubtitle:
      "Pengalaman penemuan berpusat pada manusia bagi anak muda untuk duduk berdampingan dengan pemilik usaha lokal, memahami hambatan operasional harian, dan memetakan masalah nyata sebelum menawarkan solusi apa pun.",
    heroCtaPrimary: "Mulai Kunjungan Usaha",
    heroCtaSecondary: "Pahami Metodenya",
    heroPill1: "Tanpa Promosi Jualan",
    heroPill2: "Alur Praktis Lewat HP",
    heroPill3: "Berakar pada Komunitas",
    activeLens: "● LENS AKTIF",
    inspectLens: "○ KETUK UNTUK MELIHAT",
    surfaceCaption: "Hal yang mungkin dilihat pengunjung",
    realityCaption: "Situasi untuk dibicarakan bersama",
    examplesLabel: "Contoh hal yang dapat diamati:",
    fieldStep: "LANGKAH KUNJUNGAN",
    immediateStatus: "KUNJUNGAN SAAT INI",
    capturedLabel: "DICATAT DALAM KUNJUNGAN INI",
    goToStep: "Ke langkah {step}",
    sceneKicker: "01 / Lingkungan usaha yang bergerak",
    sceneTitle: "Ekosistem yang hidup",
    sceneBody: "Orang, catatan, pesan, dan pekerjaan sehari-hari di antaranya.",
    sceneExplore: "Jelajahi adegan",
    sceneStatic: "Adegan statis",
    sceneDrag: "Seret untuk melihat sekitar",
    sceneAlt: "Miniatur 3D interaktif lingkungan usaha lokal",
    operationalCheck: "SKENARIO OPERASIONAL",
    researchHorizon: "ARAH RISET MASA DEPAN",

    // Narrative Section A: Every business has a story
    sectionA: {
      eyebrow: "01 · BEBAN YANG TAK TERLIHAT",
      title: "Di balik setiap meja kasir ada ekosistem harian yang rumit.",
      lead: "Usaha lokal bukanlah sistem abstrak. Mereka adalah jaringan hidup dari notifikasi ponsel, catatan tangan, kendala bahasa, dan kerja serabutan yang tiada henti.",
      description1:
        "Pengunjung mungkin hanya melihat tempat usaha yang sederhana. Mereka belum tentu melihat pesan yang menunggu dibalas, pemesanan yang dicatat di beberapa kalender, atau catatan tangan yang membantu pekerjaan sehari-hari. Ini hanya contoh situasi, bukan klaim tentang usaha tertentu.",
      description2:
        "Misi kita berawal dari kerendahan hati: kita tidak datang untuk menjual perangkat lunak. Kita datang dengan telinga terbuka untuk menemukan di mana waktu benar-benar terbuang dan di mana pemilik usaha memikul beban berlebih.",
      stat1Number: "1 ponsel",
      stat1Label: "Semua yang Anda butuhkan untuk mengisi bersama",
      stat2Number: "Mendengar",
      stat2Label: "Biarkan pemilik usaha menentukan ritme percakapan",
      stat3Number: "Tanpa promosi",
      stat3Label: "Dengarkan dulu sebelum membicarakan solusi",
    },

    // Narrative Section B: Look Closer (Interactive operational lenses)
    sectionB: {
      eyebrow: "02 · LIHAT LEBIH DEKAT",
      title: "Di mana hambatan harian bersembunyi di depan mata.",
      subtitle:
        "Ketuk setiap lensa operasional untuk mengungkap apa yang dilihat pengunjung biasa dibandingkan dengan apa yang sebenarnya dihadapi pemilik setiap hari.",
      toggleViewSurface: "Apa yang Dilihat Pengunjung",
      toggleViewReality: "Apa yang Dihadapi Pemilik",
      lenses: [
        {
          id: "whatsapp",
          tag: "KOMUNIKASI",
          title: "Pesan di sela-sela pelanggan",
          surface: "Pelanggan santai mengirim pesan mengharapkan balasan instan tentang harga, petunjuk arah, dan ketersediaan.",
          reality:
            "Pemilik usaha mungkin harus bergantian melayani pelanggan langsung dan membalas pesan, sehingga sulit melacak pertanyaan yang belum dijawab.",
          focalPoints: ["Pertanyaan yang menunggu balasan", "Berpindah fokus saat melayani", "Mengulang informasi yang sama"],
        },
        {
          id: "ledger",
          tag: "OPERASIONAL",
          title: "Catatan sepanjang hari kerja",
          surface: "Buku catatan rapi di samping kasir memberi kesan klasik dan autentik khas warung lokal.",
          reality:
            "Jika informasi tersebar di beberapa buku atau lembar lepas, mencari catatan lama bisa memakan waktu dan dua orang mungkin tidak tahu catatan mana yang terbaru.",
          focalPoints: ["Mencari catatan lama", "Menyamakan catatan", "Meneruskan informasi antar-shift"],
        },
        {
          id: "language",
          tag: "INTERAKSI",
          title: "Perbedaan bahasa di konter",
          surface: "Senyum dan isyarat tangan menjembatani komunikasi santai di meja kasir.",
          reality:
            "Pantangan makanan, permintaan khusus, dan petunjuk darurat sering salah dipahami. Turis mancanegara sering mengurungkan niat karena papan nama dan menu hanya diterjemahkan sebagian.",
          focalPoints: ["Alergi makanan yang salah dipahami", "Klarifikasi harga yang canggung", "Keraguan pelanggan untuk bertanya"],
        },
        {
          id: "bookings",
          tag: "KOORDINASI",
          title: "Pemesanan di beberapa tempat",
          surface: "Tamu mengira platform pemesanan modern otomatis tersinkronisasi sempurna dengan kalender.",
          reality:
            "Saat pemesanan datang melalui beberapa saluran, pemilik mungkin perlu membandingkan pesan dan kalender sebelum memastikan ketersediaan.",
          focalPoints: ["Memeriksa beberapa saluran", "Memperbarui kalender bersama", "Memastikan ketersediaan"],
        },
      ],
    },

    // Narrative Section C: Listen before suggesting
    sectionC: {
      eyebrow: "03 · FILOSOFI RISET",
      title: "Dengarkan sebelum merancang. Temukan sebelum membangun.",
      lead: "Jika kita datang dengan jawaban yang sudah dipilih, kita berisiko melewatkan masalah yang penting bagi pemilik usaha.",
      pillars: [
        {
          num: "I",
          title: "Pengamatan yang Rendah Hati",
          desc: "Kita tidak merasa lebih tahu tentang usaha tersebut daripada pemilik yang telah menjalankannya bertahun-tahun. Kita mengamati kebiasaan yang ada tanpa menghakimi.",
        },
        {
          num: "II",
          title: "Pemetaan Alat yang Nyata",
          desc: "Spreadsheet hanya berguna jika ada waktu untuk mengisinya. Kita mencatat alat apa yang sungguh-sungguh digunakan, termasuk buku tulis kertas.",
        },
        {
          num: "III",
          title: "Fokus pada Hambatan, Bukan Fitur",
          desc: "Kita bertanya pekerjaan berulang mana yang menyita waktu atau mengganggu layanan yang ingin diberikan pemilik.",
        },
        {
          num: "IV",
          title: "Bebas Paksaan Komersial",
          desc: "Jangan pernah meminta uang, jangan menawarkan harga perangkat lunak, jangan menjual jasa agensi. Riset sejati menuntut kepercayaan tulus.",
        },
      ],
    },

    // Narrative Section D: Community-first Field Visit
    sectionD: {
      eyebrow: "04 · METODE BERBASIS KOMUNITAS",
      title: "Cara melakukan kunjungan usaha yang bermakna.",
      lead: "Setiap kunjungan harus dilakukan oleh orang yang memiliki hubungan wajar dengan pemilik—tetangga, kerabat, pelanggan setia, atau teman lokal.",
      steps: [
        {
          step: "01",
          heading: "Pilih Usaha yang Sudah Anda Kenal",
          text: "Jangan pernah masuk ke toko orang asing secara dingin. Kunjungi warung tempat Anda biasa makan siang, homestay tetangga, atau dive shop kawan Anda.",
        },
        {
          step: "02",
          heading: "Duduk Bersama Memegang Satu HP",
          text: "Posisikan ponsel agar Anda berdua dapat melihat layar dengan jelas. Bacakan pertanyaan secara alami seperti obrolan akrab, bukan interogasi formal.",
        },
        {
          step: "03",
          heading: "Catat Kata-Kata Pemilik Apa Adanya",
          text: "Saat menanyakan kesulitan operasional, rekam ungkapan asli dan keluhan mereka. Jangan mengubah kata-kata jujur mereka menjadi istilah korporat yang kaku.",
        },
        {
          step: "04",
          heading: "Hormati Privasi Kontak",
          text: "Hanya simpan kontak WhatsApp jika pemilik usaha secara tegas mengizinkan komunikasi lanjutan. Jangan pernah mencentang izin secara sepihak.",
        },
      ],
    },

    // Form Section
    formSection: {
      eyebrow: "RUANG KERJA PENEMUAN",
      title: "Dokumentasikan Kunjungan Usaha",
      subtitle:
        "Lengkapi kuesioner terarah ini bersama-sama menggunakan satu ponsel. Perkembangan tersimpan otomatis di perangkat ini sehingga tidak hilang jika sinyal terputus.",
      stepCounter: "Langkah {current} dari {total}",
      viewModes: {
        stepByStep: "Mode Bertahap",
        allQuestions: "Mode Semua Pertanyaan",
      },
      draftBadgeSaved: "Draf tersimpan di perangkat",
      draftBadgeOffline: "Mode offline · Draf lokal aktif",
      draftRestoredNotification: "Draf dari sesi kunjungan terakhir berhasil dimuat kembali.",
      draftClearButton: "Reset Formulir",
      draftClearConfirm: "Apakah Anda yakin ingin menghapus draf ini? Tindakan ini tidak dapat dibatalkan.",

      // Step 1: Context & People
      step1: {
        badge: "01 / Konteks",
        title: "Siapa saja yang mengambil bagian dalam obrolan ini?",
        desc: "Tentukan lokasi dan peserta agar kita memahami latar komunitasnya.",
        pilotLocation: "Lokasi Kunjungan / Desa",
        pilotLocationPlaceholder: "mis. Nusa Lembongan, Bali",
        pilotLocationHint: "Pulau, desa, atau lingkungan tempat usaha ini berdiri.",
        participantName: "Nama Anda (Pewawancara)",
        participantNamePlaceholder: "mis. Wayan Sudarta",
        participantNameHint: "Nama Anda sebagai pemuda lokal atau peneliti komunitas.",
        businessName: "Nama Usaha",
        businessNamePlaceholder: "mis. Warung Pantai Indah, Blue Wave Diving",
        businessNameHint: "Nama dagang atau nama publik dari warung, homestay, atau toko.",
        businessType: "Jenis / Kategori Usaha",
        businessTypePlaceholder: "mis. Homestay, Kafe, Rental Motor, Dive Shop, Laundry",
        businessTypeHint: "Barang atau jasa apa yang disediakan oleh usaha ini?",
      },

      // Step 2: Current Tools
      step2: {
        badge: "02 / Alat Saat Ini",
        title: "Alat apa saja yang saat ini diandalkan oleh usaha ini?",
        desc: "Pilih semua yang sesuai. Pahami perangkat yang sudah menjadi bagian dari rutinitas harian mereka.",
        tools: {
          whatsapp: { label: "WhatsApp / Obrolan Chat", sub: "Untuk pesanan, pemesanan kamar, pertanyaan pelanggan, dan komunikasi pemasok" },
          paper_records: { label: "Catatan Kertas / Buku Tulis", sub: "Nota tulisan tangan, buku kas harian fisik, kalender dinding" },
          spreadsheets: { label: "Spreadsheet (Excel / Google Sheets)", sub: "Pembukuan manual, pencatatan inventaris, laporan keuangan" },
          pos_system: { label: "Sistem POS / Mesin Kasir", sub: "Mesin kasir digital, mesin EDC kartu, atau software POS" },
          none: { label: "Tidak Ada / Hanya Ingatan", sub: "Tanpa pencatatan formal; mengandalkan uang tunai fisik dan daya ingat" },
          other: { label: "Sistem Lainnya", sub: "Mesin reservasi khusus, aplikasi marketplace, atau alur kerja khusus" },
        },
        toolsHint: "Catatan: Memilih 'Tidak Ada' akan membatalkan pilihan alat lainnya demi akurasi data.",
      },

      // Step 3: Problem Areas
      step3: {
        badge: "03 / Area Masalah",
        title: "Di mana hambatan dan stres paling sering terjadi?",
        desc: "Pilih semua yang sesuai. Di bagian mana pemilik merasa kewalahan atau tersendat?",
        problems: {
          tourist_replies: { label: "Membalas Pesan Wisatawan", sub: "Pesan larut malam, tawar-menawar harga, pertanyaan dasar berulang" },
          social_media: { label: "Pengelolaan Media Sosial", sub: "Membuat konten, memperbarui postingan, merawat akun Instagram/TikTok" },
          bookings: { label: "Pemesanan & Reservasi", sub: "Pemesanan ganda, sinkronisasi kalender, tamu mendadak, uang muka" },
          translation: { label: "Bahasa & Penerjemahan", sub: "Menjelaskan menu makanan, alergi, dan permintaan khusus pelanggan" },
          other: { label: "Hambatan Lainnya", sub: "Jadwal staf, pembayaran pemasok, pembukuan pajak, atau kehabisan stok" },
        },
        problemsHint: "Pilih area yang ingin dibicarakan oleh pemilik usaha.",
      },

      // Step 4: In Their Own Words
      step4: {
        badge: "04 / Pendalaman Masalah",
        title: "Apa yang paling banyak menyita waktu atau menyebabkan kehilangan pelanggan?",
        desc: "Tanyakan pertanyaan ini secara persis kepada pemilik dan dengarkan tanpa memotong pembicaraan. Rekam suara asli mereka.",
        label: "Kesulitan Operasional Utama Pemilik",
        placeholder:
          "Contoh: 'Saya sering bergantian melayani pelanggan dan memeriksa pesan. Saya khawatir ada pertanyaan yang terlewat.' Gunakan kata-kata pemilik usaha sendiri; contoh ini hanya ilustrasi.",
        hint: "Minimal 10 karakter. Tangkap detail yang nyata: angka, waktu kejadian, dan rasa frustrasi yang dialami.",
        charCount: "{count} / 2000 karakter",
      },

      // Step 5: Frequency & Consent
      step5: {
        badge: "05 / Frekuensi & Kelanjutan",
        title: "Seberapa sering hal ini terjadi, dan bolehkah kita tetap terhubung?",
        desc: "Ketahui seberapa rutin masalah ini terjadi, dan mintalah persetujuan kontak lanjutan secara transparan.",
        frequencyTitle: "Seberapa sering kesulitan operasional ini dialami?",
        frequency: {
          daily: { label: "Setiap Hari", sub: "Beban rutin yang dialami setiap hari tanpa henti" },
          weekly: { label: "Setiap Minggu", sub: "Terjadi beberapa kali dalam kurun satu minggu" },
          monthly: { label: "Setiap Bulan", sub: "Kendala berkala saat laporan bulanan atau lonjakan pesanan" },
          occasionally: { label: "Sesekali", sub: "Masalah yang muncul sesekali pada musim liburan tertentu" },
          unsure: { label: "Tidak Yakin", sub: "Waktu kejadian tidak menentu atau sulit dipastikan" },
        },
        consentBoxTitle: "Tindak Lanjut Sukarela yang Terhormat",
        consentBoxDesc:
          "Apakah kami boleh menghubungi Anda tentang kunjungan dan masalah yang dibicarakan? Nomor WhatsApp bersifat opsional.",
        consentLabel: "Pemilik usaha secara sadar setuju untuk dihubungi dalam rangka riset lanjutan.",
        consentNotice:
          "Nomor ini hanya digunakan untuk tindak lanjut mengenai kunjungan ini. Persetujuan dapat dibiarkan kosong tanpa harus membagikan kontak.",
        contactName: "Nama Orang yang Dihubungi",
        contactNamePlaceholder: "mis. Ibu Ketut",
        whatsapp: "Nomor WhatsApp",
        whatsappPlaceholder: "+62 812 3456 7890",
        whatsappHint: "Sertakan kode negara (+62 untuk Indonesia).",
      },

      // Navigation & Submission
      buttons: {
        back: "Langkah Sebelumnya",
        next: "Langkah Berikutnya",
        submit: "Simpan Kunjungan Usaha",
        submitting: "Menyimpan ke Protokol...",
        retry: "Coba Simpan Lagi",
      },

      validationErrors: {
        step1Required: "Mohon lengkapi lokasi, nama Anda, nama usaha, dan jenis usaha.",
        toolsRequired: "Mohon pilih minimal satu alat yang saat ini digunakan oleh usaha ini.",
        problemsRequired: "Mohon pilih minimal satu area masalah yang dihadapi usaha ini.",
        painRequired: "Mohon jelaskan kesulitan operasional secara bermakna (minimal 10 karakter).",
        frequencyRequired: "Mohon pilih seberapa sering masalah ini terjadi.",
        consentContactRequired: "Bila persetujuan tindak lanjut dicentang, nama kontak dan nomor WhatsApp wajib diisi.",
        genericRequired: "Mohon lengkapi semua kolom wajib yang ditandai sebelum melanjutkan.",
      },

      // Submission Success State
      successState: {
        badge: "TERCATAT DI ARSIP",
        title: "Kunjungan Usaha Berhasil Disimpan.",
        lead: "Peladen telah mengonfirmasi penerimaan catatan kunjungan ini. Detail kontak hanya disertakan jika Anda menyetujui tindak lanjut.",
        metaTitle: "Verifikasi Pengiriman",
        refLabel: "UUID Pengiriman",
        businessLabel: "Usaha",
        typeLabel: "Klasifikasi",
        locationLabel: "Lokasi",
        statusLabel: "Status",
        statusReceived: "Diterima · Mengantre untuk Tinjauan Bukti",
        note: "Tidak ada komitmen komersial apa pun. Pemilik usaha memegang kendali penuh atas informasi mereka.",
        actionNew: "Catat Kunjungan Usaha Lainnya",
        actionHome: "Kembali ke Beranda",
      },

      // Offline / Error messages
      networkNotice: {
        offlineTitle: "Mode Offline Aktif",
        offlineBody:
          "Koneksi internet Anda terputus. Draf kunjungan tersimpan di peramban pada perangkat ini. Setelah terhubung kembali, ketuk 'Simpan Kunjungan Usaha' untuk mengirimnya.",
        submissionError:
          "Tidak dapat terhubung ke peladen pengiriman. Draf Anda tetap utuh di ponsel ini. Periksa sinyal internet Anda lalu coba lagi.",
      },
    },

    // Narrative Section E: What happens after the visit
    sectionE: {
      eyebrow: "05 · CAKRAWALA MASA DEPAN",
      title: "Apa yang terjadi pada pengetahuan yang telah ditemukan?",
      lead: "Kunjungan ini mencatat nama usaha dan masalah yang ingin dibicarakan oleh pemilik. Tahap mendengarkan inilah satu-satunya proses yang saat ini dinyatakan aktif.",
      immediateOutput: {
        title: "Informasi yang dicatat dalam kunjungan",
        items: [
          "Nama, jenis, dan alat kerja sehari-hari yang disebutkan pemilik usaha.",
          "Area masalah dan cerita terbuka yang dicatat selama percakapan ini.",
          "Detail kontak hanya jika pemilik usaha menyetujui tindak lanjut secara tegas.",
        ],
      },
      v3Roadmap: {
        title: "Perjalanan V3 yang Lebih Luas (Cakrawala Masa Depan)",
        note: "Kerangka berikut menggambarkan rencana tahapan riset jangka panjang. Hanya Langkah 1 (Mendengarkan & Penemuan) yang aktif saat ini.",
        steps: [
          { phase: "01", name: "Dengarkan", status: "AKTIF SAAT INI", desc: "Duduk bersama pemilik lokal. Petakan masalah nyata memakai protokol penemuan ini." },
          { phase: "02", name: "Prioritaskan", status: "RISET", desc: "Kelompokkan masalah bersama lintas usaha untuk memilah peluang dengan dampak tertinggi." },
          { phase: "03", name: "Latih", status: "RISET", desc: "Bekali pemuda lokal dengan alur kerja digital praktis untuk mengatasi kendala yang terverifikasi." },
          { phase: "04", name: "Demokan", status: "RISET", desc: "Bangun bukti konsep tanpa biaya yang langsung menjawab kesulitan spesifik pemilik usaha." },
          { phase: "05", name: "Sepakati Lingkup", status: "RISET", desc: "Kesepakatan berbasis hasil kerja yang sederhana dan transparan tanpa biaya agensi yang memberatkan." },
          { phase: "06", name: "Kirim & Verifikasi", status: "RISET", desc: "Terapkan alat digital, ukur waktu yang berhasil dihemat, dan pastikan perbaikan nyata terjadi." },
          { phase: "07", name: "Pelajari & Ulangi", status: "RISET", desc: "Dokumentasikan studi kasus agar pemuda lain dapat meniru alur kerja yang terbukti berhasil." },
        ],
      },
    },

    // Common
    languageToggle: "Language",
    footerQuote: "Dengarkan dahulu. Pahami sebelum mengusulkan solusi.",
  },
};
