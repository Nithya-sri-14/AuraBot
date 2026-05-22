/* =============================================================================
   AuraPort — Unified SPA Controller
   Single URL: http://localhost:3000
   Routes: #portfolio | #login | #signup | #setup | #admin
============================================================================= */

'use strict';

// ---------------------------------------------------------------------------
// GLOBAL STATE
// ---------------------------------------------------------------------------
let PROJECTS_DB = {};
let currentView = 'portfolio';
let viewedUser = 'admin';
let SOCKET = null;

// ---------------------------------------------------------------------------
// ROUTER — show/hide views based on hash
// ---------------------------------------------------------------------------
// Map view names to URL paths and back
const VIEW_TO_PATH = {
  portfolio: '/',
  login: '/login',
  signup: '/signup',
  setup: '/setup',
  admin: '/admin'
};

const PATH_TO_VIEW = {
  '/': 'portfolio',
  '/login': 'login',
  '/signup': 'signup',
  '/setup': 'setup',
  '/admin': 'admin'
};

function navigate(view, opts = {}, pushState = true) {
  const views = ['portfolio', 'login', 'signup', 'setup', 'admin'];
  if (!views.includes(view)) view = 'portfolio';

  // Auth guards
  const token = sessionStorage.getItem('admin_token');
  if ((view === 'setup' || view === 'admin') && !token) {
    view = 'login';
  }
  // Redirect authenticated users away from auth pages
  if ((view === 'login' || view === 'signup') && token) {
    view = 'admin';
  }

  // Track the viewed user context dynamically on portfolio transitions
  if (view === 'portfolio') {
    if (opts.user && opts.user !== 'admin') {
      viewedUser = opts.user;
    } else {
      const urlUser = getUrlUser();
      const loggedInUser = sessionStorage.getItem('admin_user');
      if (urlUser && urlUser !== 'admin') {
        viewedUser = urlUser;
      } else if (loggedInUser) {
        viewedUser = loggedInUser;
      } else {
        viewedUser = 'admin';
      }
      opts.user = viewedUser;
    }
  }

  // Update the browser URL so the address bar reflects the current view
  if (pushState) {
    let newPath = VIEW_TO_PATH[view] || '/';
    if (view === 'portfolio' && viewedUser && viewedUser !== 'admin') {
      newPath += `?user=${encodeURIComponent(viewedUser)}`;
    }
    const currentFull = window.location.pathname + window.location.search;
    if (currentFull !== newPath) {
      history.pushState({ view, opts }, '', newPath);
    }
  }

  // Merge login/signup into one auth view
  const domView = (view === 'signup' || view === 'login') ? 'auth' : view;

  // Hide all views
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));

  // Show target
  const el = document.getElementById(`view-${domView}`);
  if (el) el.classList.add('active');

  currentView = view;

  // View-specific init
  if (view === 'portfolio') {
    initPortfolioView(opts.user);
    socketWatchUser(viewedUser);
  }
  if (view === 'login' || view === 'signup') initAuthView(view);
  if (view === 'setup') initSetupView();
  if (view === 'admin') initAdminView();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchAuthTab(tab) {
  navigate(tab);
}

// ---------------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initThemeManager();
  initHeaderScroll();
  initMobileMenu();
  initNavAuthButton();
  initSocketIO();

  // Initialize premium custom widgets and floating layouts
  initCustomizer();
  initAuraBot();
  initCanvasParticles();
  initResumeModal();

  // Detect current URL path and navigate to the matching view
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const params   = new URLSearchParams(window.location.search);
  const initialView = PATH_TO_VIEW[pathname] || 'portfolio';

  // Seed initial history state so popstate works from the start
  const bootUser = params.get('user') || params.get('u') || sessionStorage.getItem('admin_user') || 'admin';
  history.replaceState({ view: initialView, opts: { user: bootUser } }, '', window.location.href);

  const initialUser = params.get('user') || params.get('u') || sessionStorage.getItem('admin_user') || 'admin';
  navigate(initialView, { user: initialUser }, false);

  // Handle browser back/forward navigation
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.view) {
      navigate(event.state.view, event.state.opts || {}, false);
    } else {
      // Fallback: parse pathname again
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      const view = PATH_TO_VIEW[path] || 'portfolio';
      navigate(view, {}, false);
    }
  });
});

// ---------------------------------------------------------------------------
// NAV AUTH BUTTON (top-right)
// ---------------------------------------------------------------------------
function initNavAuthButton() {
  const container = document.getElementById('nav-auth-btn');
  if (!container) return;

  const renderBtn = () => {
    const token = sessionStorage.getItem('admin_token');
    if (token) {
      container.innerHTML = `
        <button class="btn btn-secondary" style="padding:0.4rem 1rem;font-size:0.85rem;" onclick="navigate('admin')">Dashboard</button>
      `;
    } else {
      container.innerHTML = `
        <button class="btn btn-primary" style="padding:0.4rem 1rem;font-size:0.85rem;" onclick="navigate('login')">Sign In</button>
      `;
    }
  };
  renderBtn();
  // Re-render on auth state changes via custom event
  window.addEventListener('auraport:authchange', renderBtn);
}

function dispatchAuthChange() {
  window.dispatchEvent(new Event('auraport:authchange'));
}

// ---------------------------------------------------------------------------
// SOCKET.IO REAL-TIME
// ---------------------------------------------------------------------------
function initSocketIO() {
  try {
    const backendUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? window.location.origin
      : 'https://aurabot-personal-portfolio-website.onrender.com';
    SOCKET = io(backendUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000
    });

    SOCKET.on('connect', () => {
      const user = sessionStorage.getItem('admin_user') || viewedUser;
      if (user) SOCKET.emit('portfolio:watch', user);
    });

    SOCKET.on('portfolio:updated', (data) => {
      // Reload portfolio data if currently viewing the portfolio page
      if (currentView === 'portfolio' && (!data.user || data.user === viewedUser)) {
        loadPortfolioData(viewedUser);
      }
    });

    SOCKET.on('disconnect', () => {});
  } catch (e) {
    console.warn('[Socket.io] Not available — running without real-time updates');
    SOCKET = null;
  }
}

function socketWatchUser(user) {
  if (SOCKET && SOCKET.connected) {
    SOCKET.emit('portfolio:watch', user);
  }
}

// ---------------------------------------------------------------------------
// THEME MANAGER (shared across all views)
// ---------------------------------------------------------------------------
function initThemeManager() {
  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');

  const applyTheme = (theme) => {
    if (colorSchemeMeta) colorSchemeMeta.content = theme;
    localStorage.setItem('color-scheme', theme);
  };

  const toggleTheme = () => {
    const current = colorSchemeMeta ? colorSchemeMeta.content : 'light dark';
    if (current === 'dark') applyTheme('light');
    else if (current === 'light') applyTheme('dark');
    else {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(systemDark ? 'light' : 'dark');
    }
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('#theme-toggle') || e.target.closest('#admin-theme-toggle')) {
      toggleTheme();
    }
  });
}

// ---------------------------------------------------------------------------
// HEADER SCROLL
// ---------------------------------------------------------------------------
function initHeaderScroll() {
  const header = document.getElementById('header');
  if (!header) return;
  const handle = () => header.classList.toggle('scrolled', window.scrollY > 50);
  window.addEventListener('scroll', handle, { passive: true });
  handle();
}

// ---------------------------------------------------------------------------
// MOBILE MENU
// ---------------------------------------------------------------------------
function initMobileMenu() {
  const btn = document.getElementById('mobile-menu-btn');
  const nav = document.getElementById('navbar');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', !expanded);
    nav.classList.toggle('active');
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      btn.setAttribute('aria-expanded', 'false');
      nav.classList.remove('active');
    });
  });

  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target) && !btn.contains(e.target) && nav.classList.contains('active')) {
      btn.setAttribute('aria-expanded', 'false');
      nav.classList.remove('active');
    }
  });
}

// ===========================================================================
// VIEW 1: PORTFOLIO
// ===========================================================================
let portfolioInitialized = false;

function initPortfolioView(user) {
  initScrollReveals();
  initActiveNavTracking();
  initProjectModal();
  initContactForm();
  loadPortfolioData(user || getUrlUser());
}

function getUrlUser() {
  const params = new URLSearchParams(window.location.search);
  return params.get('user') || params.get('u') || 'admin';
}

async function loadPortfolioData(user) {
  const loadId = Date.now();
  loadPortfolioData._lastLoadId = loadId;
  try {
    const res = await fetch(`/api/portfolio?user=${encodeURIComponent(user)}`);
    if (!res.ok) throw new Error('Portfolio data unavailable.');
    const data = await res.json();
    if (loadPortfolioData._lastLoadId !== loadId) return; // stale response
    renderPortfolio(data, user);
  } catch (err) {
    console.error('[Portfolio Load Error]', err);
  }
}

function renderPortfolio(data, userParam) {
  const p = data.profile || {};
  const username = p.username || userParam;

  // Page title & logo
  if (p.name) {
    document.title = `${p.name} | AuraPort`;
    const logoEl = document.getElementById('logo-text');
    if (logoEl) {
      const parts = p.name.split(' ');
      logoEl.textContent = parts.length >= 2 ? `${parts[0]}.${parts[1][0]}` : p.name;
    }
    const footerEl = document.getElementById('footer-name');
    if (footerEl) footerEl.textContent = p.name;
  }

  // Dynamic Avatar Initials
  const avatarInitials = document.getElementById('hero-avatar-initials');
  if (avatarInitials && p.name) {
    const parts = p.name.trim().split(/\s+/);
    const initials = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0][0] + (parts[0][1] || '');
    avatarInitials.textContent = initials.toUpperCase();
  }

  // Hero Tagline & Typewriter initialization
  const heroSub = document.getElementById('hero-subtitle');
  if (heroSub) heroSub.textContent = p.subtitle || 'Engineering High-End Architectures';

  const roles = p.specialization ? [p.specialization, "Full-Stack Web Architect", "AI Systems Specialist", "Premium UI Developer"] : ["Full-Stack Web Architect", "AI Systems Specialist", "Premium UI Developer"];
  initTypewriter(roles);

  // Hero actions: 3 specific Recruiter CTAs
  const heroActions = document.getElementById('hero-actions');
  if (heroActions) {
    // Add "Build Your Portfolio" CTA for non-logged-in users
    const token = sessionStorage.getItem('admin_token');
    let html = '';
    if (!token) {
      html += `<a href="#" onclick="navigate('signup');return false;" class="btn btn-primary" style="background:linear-gradient(135deg,var(--color-primary),var(--color-secondary));border:none;">✨ Build Your Portfolio</a>`;
    }
    html += `<a href="#projects" class="btn btn-primary">View Projects</a>`;
    html += `<a href="#contact" class="btn btn-secondary">Contact Me</a>`;
    if (p.hasResume) {
      html += `<a href="/api/portfolio/resume?user=${encodeURIComponent(username)}" class="btn btn-secondary" download>Download Resume</a>`;
    } else {
      html += `<button type="button" id="hero-resume-btn" class="btn btn-secondary">Download Resume</button>`;
    }
    heroActions.innerHTML = html;

    // Bind click event to trigger the printable academic resume modal
    document.getElementById('hero-resume-btn')?.addEventListener('click', () => {
      openResumeModal(p, data.skills || [], data.experience || DEFAULT_EXPERIENCE, data.education || []);
    });
  }

  // Floating social media links flanking the hero block
  const floatGithub = document.getElementById('floating-github');
  const floatLinkedin = document.getElementById('floating-linkedin');
  const floatTwitter = document.getElementById('floating-twitter');
  if (floatGithub) {
    if (p.github) { floatGithub.href = p.github; floatGithub.style.display = 'flex'; }
    else floatGithub.style.display = 'none';
  }
  if (floatLinkedin) {
    if (p.linkedin) { floatLinkedin.href = p.linkedin; floatLinkedin.style.display = 'flex'; }
    else floatLinkedin.style.display = 'none';
  }
  if (floatTwitter) {
    if (p.twitter) { floatTwitter.href = p.twitter; floatTwitter.style.display = 'flex'; }
    else floatTwitter.style.display = 'none';
  }

  // About narrative
  const aboutText = document.getElementById('about-narrative');
  if (aboutText) aboutText.innerHTML = `<p class="about-desc">${p.subtitle || ''}</p>`;

  // Personal details
  const details = document.getElementById('personal-details');
  if (details) {
    const eduHtml = (data.education || []).length > 1
      ? `<div class="detail-item"><strong>Education:</strong> ${data.education.map(e => `${e.degree}${e.school ? ', ' + e.school : ''}`).join('; ')}</div>`
      : `<div class="detail-item"><strong>Education:</strong> ${p.education || ''}</div>`;
    details.innerHTML = `
      <div class="detail-item"><strong>Location:</strong> ${p.location || ''}</div>
      ${eduHtml}
      <div class="detail-item"><strong>Specialization:</strong> ${p.specialization || ''}</div>
      <div class="detail-item"><strong>Email:</strong> <a href="mailto:${p.email || ''}" class="btn-text">${p.email || ''}</a></div>
    `;
  }

  // Stats
  const statsGrid = document.getElementById('stats-grid');
  if (statsGrid && data.stats) {
    statsGrid.innerHTML = data.stats.map(s => {
      const match = s.num.match(/^(\d+)(.*)$/);
      const target = match ? match[1] : 0;
      const suffix = match ? match[2] : '';
      return `<div class="stat-card"><span class="stat-num" data-target="${target}" data-suffix="${suffix}">0${suffix}</span><span class="stat-lbl">${s.lbl}</span></div>`;
    }).join('');

    initStatsCountUp();
  }

  // 1. Services Grid Renderer with Fallbacks
  const services = data.services || DEFAULT_SERVICES;
  const servicesGrid = document.getElementById('services-grid');
  if (servicesGrid) {
    servicesGrid.innerHTML = services.map(s => `
      <div class="service-card">
        <div class="service-icon">${s.icon}</div>
        <h3 class="service-title">${s.title}</h3>
        <p class="service-desc">${s.desc}</p>
      </div>
    `).join('');
  }

  // Skills
  const skillsGrid = document.getElementById('skills-grid');
  if (skillsGrid && data.skills) {
    const cats = {
      frontend: { title: 'Frontend UI/UX', icon: '🎨', items: [] },
      backend:  { title: 'Backend Servers', icon: '⚙️', items: [] },
      systems:  { title: 'Systems & Cloud', icon: '☁️', items: [] }
    };
    data.skills.forEach(s => {
      if (cats[s.category]) cats[s.category].items.push(s);
      else cats.systems.items.push(s);
    });

    skillsGrid.innerHTML = Object.values(cats).filter(c => c.items.length > 0).map(c => {
      // Find the highest rated skill to feature as a circular indicator
      const featuredSkill = c.items.reduce((max, item) => item.level > max.level ? item : max, c.items[0]);
      
      return `
        <div class="skills-category-card">
          <div class="category-header">
            <span class="category-icon">${c.icon}</span>
            <h3>${c.title}</h3>
          </div>
          <div class="category-card-content">
            <ul class="skills-list">
              ${c.items.map(item => `
                <li>
                  <div class="skill-info"><span>${item.name}</span><span>${item.level}%</span></div>
                  <div class="skill-bar"><div class="skill-progress" style="width:${item.level}%;"></div></div>
                </li>
              `).join('')}
            </ul>
            <div class="featured-circular-skill" title="Top Skill: ${featuredSkill.name}">
              <svg class="circular-svg" viewBox="0 0 100 100">
                <circle class="circle-bg" cx="50" cy="50" r="40" stroke="var(--color-glass-border)" stroke-width="6" fill="transparent"/>
                <circle class="circle-progress" cx="50" cy="50" r="40" stroke="var(--color-primary)" stroke-width="8" fill="transparent"
                  stroke-dasharray="251.2" stroke-dashoffset="251.2" data-target-offset="${251.2 - (251.2 * featuredSkill.level) / 100}"
                  style="transition: stroke-dashoffset 1.5s cubic-bezier(0.25, 0.8, 0.25, 1);"
                />
                <text x="50" y="56" class="circle-text-val" text-anchor="middle" font-size="15" fill="var(--color-text)" font-weight="700" style="transform: rotate(90deg); transform-origin: center;">${featuredSkill.level}%</text>
              </svg>
              <span class="featured-skill-name">${featuredSkill.name.split(' ')[0]}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Animate bars & rings on load
    setTimeout(() => {
      document.querySelectorAll('.skill-progress').forEach(bar => {
        const w = bar.style.width; bar.style.width = '0%';
        setTimeout(() => { bar.style.width = w; }, 100);
      });
      document.querySelectorAll('.circle-progress').forEach(ring => {
        const offset = ring.getAttribute('data-target-offset');
        ring.style.strokeDashoffset = '251.2';
        setTimeout(() => { ring.style.strokeDashoffset = offset; }, 150);
      });
    }, 200);
  }

  // 2. Experience Timeline Renderer with Fallbacks (including education)
  const experience = data.experience || DEFAULT_EXPERIENCE;
  const timelineContainer = document.getElementById('timeline-container');
  if (timelineContainer) {
    const eduEntries = (data.education || []).map(e => ({
      icon: '🎓', date: e.date || '', title: e.degree || '', org: e.school || '', desc: ''
    }));
    const allEntries = [...eduEntries, ...experience];
    timelineContainer.innerHTML = allEntries.map(e => `
      <div class="timeline-node">
        <div class="timeline-badge">${e.icon || '💼'}</div>
        <div class="timeline-content">
          <span class="timeline-date">${e.date}</span>
          <h3 class="timeline-title">${e.title}</h3>
          <h4 class="timeline-org">${e.org}</h4>
          <p class="timeline-desc">${e.desc}</p>
        </div>
      </div>
    `).join('');
  }

  // Projects
  const projectsGrid = document.getElementById('projects-grid');
  if (projectsGrid && data.projects) {
    PROJECTS_DB = {};
    data.projects.forEach(proj => { PROJECTS_DB[proj.id] = proj; });

    projectsGrid.innerHTML = data.projects.map(proj => `
      <article class="project-card" data-project="${proj.id}" data-category="${proj.category || 'all'}">
        <div class="project-img-wrapper">
          <div class="project-visual-cover ${proj.gradientClass || 'visual-synapse'}">
            <span class="visual-tag">${proj.tag || '<Tag/>'}</span>
          </div>
        </div>
        <div class="project-info">
          <span class="project-meta">${proj.meta}</span>
          <h3 class="project-card-title">${proj.title}</h3>
          <p class="project-card-desc">${proj.desc}</p>
          <div class="project-card-footer">
            <span class="project-category-badge" data-cat="${proj.category || 'frontend'}">${proj.category === 'ai-ml' ? 'AI & Systems' : proj.category === 'frontend' ? 'Frontend UI/UX' : 'Backend Servers'}</span>
            <button type="button" class="btn btn-secondary open-modal-btn">Explore &rarr;</button>
          </div>
        </div>
      </article>
    `).join('');

    initProjectsFilter();
    initDeveloperInsights();
  }

  // 2.5 Skill Recommendations
  const recs = data.recommendations || [];
  const recSection = document.getElementById('recommendations');
  const recGrid = document.getElementById('recommendations-grid');
  if (recSection && recGrid) {
    if (recs.length) {
      recSection.style.display = 'block';
      recGrid.innerHTML = recs.map(r => {
        const priorityColor = r.priority === 'high' ? 'var(--color-accent)' : r.priority === 'medium' ? 'var(--color-primary)' : 'var(--color-text-muted)';
        return `
          <div class="rec-card" style="border-left:4px solid ${priorityColor};">
            <div class="rec-icon">${r.icon}</div>
            <div class="rec-body">
              <h3 class="rec-title">${r.title}</h3>
              <p class="rec-desc">${r.desc}</p>
              <span class="rec-priority" style="color:${priorityColor};">${r.priority} priority</span>
            </div>
          </div>
        `;
      }).join('');
    } else {
      recSection.style.display = 'none';
    }
  }

  // 3. Certifications Grid Renderer with Fallbacks
  const certifications = data.certifications || DEFAULT_CERTIFICATIONS;
  const certsGrid = document.getElementById('certifications-grid');
  if (certsGrid) {
    certsGrid.innerHTML = certifications.map(c => `
      <div class="cert-card">
        <div class="cert-icon">${c.icon}</div>
        <div class="cert-body">
          <h3 class="cert-title">${c.title}</h3>
          <span class="cert-issuer">${c.issuer}</span>
          <span class="cert-date">${c.date}</span>
          <a href="${c.link || '#'}" class="cert-verify-link" target="_blank" rel="noopener">Verify Credential &rarr;</a>
        </div>
      </div>
    `).join('');
  }

  // 4. Achievements Grid Renderer with Fallbacks
  const achievements = data.achievements || DEFAULT_ACHIEVEMENTS;
  const achsGrid = document.getElementById('achievements-grid');
  if (achsGrid) {
    achsGrid.innerHTML = achievements.map(a => `
      <div class="ach-card">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-body">
          <h3 class="ach-title">${a.title}</h3>
          <span class="ach-meta">${a.meta}</span>
          <p class="ach-desc">${a.desc}</p>
        </div>
      </div>
    `).join('');
  }

  // 5. Testimonials Carousel Renderer with Fallbacks
  const testimonials = data.testimonials || DEFAULT_TESTIMONIALS;
  const testimonialsCarousel = document.getElementById('testimonials-carousel');
  const carouselDots = document.getElementById('carousel-dots');
  if (testimonialsCarousel && carouselDots) {
    testimonialsCarousel.innerHTML = testimonials.map((t, idx) => `
      <div class="testimonial-slide ${idx === 0 ? 'active' : ''}">
        <blockquote class="testimonial-quote">${t.quote}</blockquote>
        <div class="testimonial-author">
          <div class="testimonial-avatar">${t.avatar || (t.name ? t.name[0] : 'U')}</div>
          <div class="author-info">
            <h4>${t.name}</h4>
            <span>${t.title}</span>
          </div>
        </div>
      </div>
    `).join('');

    carouselDots.innerHTML = testimonials.map((_, idx) => `
      <button class="carousel-dot ${idx === 0 ? 'active' : ''}" data-slide="${idx}" aria-label="Go to testimonial slide ${idx + 1}"></button>
    `).join('');

    // Wire up slider logic
    initTestimonialSlider();
  }

  // Contact links
  const contactList = document.getElementById('contact-links-list');
  if (contactList) {
    contactList.innerHTML = `
      <li><span class="contact-icon">📍</span><div><span class="contact-label">Location</span><span class="contact-val">${p.location || ''}</span></div></li>
      <li><span class="contact-icon">📧</span><div><span class="contact-label">Email</span><a href="mailto:${p.email || ''}" class="contact-val">${p.email || ''}</a></div></li>
      <li><span class="contact-icon">🌐</span><div><span class="contact-label">Social</span>
        <div class="social-row">
          ${p.github   ? `<a href="${p.github}"   target="_blank" rel="noopener">GitHub</a>` : ''}
          ${p.linkedin ? `<span>•</span><a href="${p.linkedin}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
          ${p.twitter  ? `<span>•</span><a href="${p.twitter}"  target="_blank" rel="noopener">Twitter</a>` : ''}
        </div>
      </div></li>
    `;
  }
}

// Scroll reveals
function initScrollReveals() {
  const els = document.querySelectorAll('.scroll-reveal');
  if (!els.length) return;
  const obs = new IntersectionObserver((entries, observer) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        observer.unobserve(e.target);
        if (e.target.id === 'skills') {
          document.querySelectorAll('.skill-progress').forEach(bar => {
            const w = bar.style.width; bar.style.width = '0%';
            setTimeout(() => { bar.style.width = w; }, 100);
          });
          document.querySelectorAll('.circle-progress').forEach(ring => {
            const offset = ring.getAttribute('data-target-offset');
            ring.style.strokeDashoffset = '251.2';
            setTimeout(() => { ring.style.strokeDashoffset = offset; }, 150);
          });
        }
      }
    });
  }, { threshold: 0.15 });
  els.forEach(el => obs.observe(el));
}

// Nav tracking
function initActiveNavTracking() {
  const sections = document.querySelectorAll('#view-portfolio section');
  const links = document.querySelectorAll('.nav-link');
  if (!sections.length || !links.length) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id;
        links.forEach(l => {
          l.classList.toggle('active', l.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
  sections.forEach(s => obs.observe(s));
}

// Project modal
function initProjectModal() {
  const modal = document.getElementById('project-modal');
  const closeBtn = document.querySelector('#project-modal .close-modal-btn');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  if (!modal) return;

  const openModal = (id) => {
    const p = PROJECTS_DB[id]; if (!p) return;
    modalTitle.textContent = p.title;
    const badges = (p.techs || []).map(t => `<span class="modal-tech-badge">${t}</span>`).join('');
    modalBody.innerHTML = `
      <p style="font-weight:600;color:var(--color-primary);margin-bottom:0.5rem;">${p.meta}</p>
      <p>${p.desc}</p><p>${p.details}</p>
      <h4 style="font-size:1.1rem;margin-top:1.5rem;margin-bottom:0.5rem;font-family:var(--font-serif)">Key Technologies:</h4>
      <div class="modal-tech-list">${badges}</div>
      <div class="modal-footer" style="margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--color-card-border);">
        <a href="https://github.com" target="_blank" rel="noopener" class="btn btn-primary" style="padding:0.65rem 1.5rem;font-size:0.9rem;">View Source</a>
        <button type="button" class="btn btn-secondary close-modal-inner" style="padding:0.65rem 1.5rem;font-size:0.9rem;">Close</button>
      </div>
    `;
    modal.showModal();
    modalBody.querySelector('.close-modal-inner').addEventListener('click', () => modal.close());
  };

  document.getElementById('projects-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.open-modal-btn');
    if (!btn) return;
    const card = btn.closest('.project-card');
    if (card) openModal(card.getAttribute('data-project'));
  });

  closeBtn?.addEventListener('click', () => modal.close());

  if (!('closedBy' in HTMLDialogElement.prototype)) {
    modal.addEventListener('click', (e) => {
      const r = modal.getBoundingClientRect();
      const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
      if (!inside) modal.close();
    });
  }
}

// Contact form
function initContactForm() {
  const form = document.getElementById('contact-form');
  const submitBtn = document.getElementById('submit-btn');
  const statusFeed = document.getElementById('form-status');
  if (!form || !submitBtn) return;

  const getErrMsg = (input) => {
    if (input.validity.valueMissing) return 'This field is required.';
    if (input.validity.typeMismatch && input.type === 'email') return 'Please supply a valid email.';
    if (input.validity.tooShort) return `Min ${input.minLength} characters required.`;
    return input.validationMessage;
  };
  const validateField = (input) => {
    const err = input.parentNode.querySelector('.error-msg');
    if (!input.checkValidity()) { if (err) err.textContent = getErrMsg(input); return false; }
    else { if (err) err.textContent = ''; return true; }
  };

  form.querySelectorAll('input,textarea').forEach(el => {
    el.addEventListener('blur', () => validateField(el));
    el.addEventListener('input', () => { if (el.checkValidity()) { const e = el.parentNode.querySelector('.error-msg'); if (e) e.textContent = ''; } });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let valid = true;
    form.querySelectorAll('input,textarea').forEach(el => { if (!validateField(el)) valid = false; });
    if (!valid) return;

    submitBtn.disabled = true;
    const spinner = submitBtn.querySelector('.loader-spinner');
    if (spinner) spinner.style.display = 'inline-block';
    statusFeed.textContent = 'Sending...'; statusFeed.className = 'form-status';

    try {
      const res = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('form-name').value.trim(),
          email: document.getElementById('form-email').value.trim(),
          subject: document.getElementById('form-subject').value.trim(),
          message: document.getElementById('form-message').value.trim()
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        statusFeed.textContent = result.message || 'Message sent!'; statusFeed.className = 'form-status success'; form.reset();
        showToast(result.message || 'Message sent successfully!', 'success');
      } else {
        statusFeed.textContent = result.error || 'Server error.'; statusFeed.className = 'form-status error';
        showToast(result.error || 'Failed to submit form.', 'error');
      }
    } catch (err) {
      statusFeed.textContent = 'Connection failed.'; statusFeed.className = 'form-status error';
      showToast('Connection failed. Please check network.', 'error');
    } finally {
      submitBtn.disabled = false; if (spinner) spinner.style.display = 'none';
    }
  });
}

// ---------------------------------------------------------------------------
// AURA TOAST NOTIFICATION ENGINE
// ---------------------------------------------------------------------------
function showToast(message, type = 'success') {
  let container = document.getElementById('aura-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'aura-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `aura-toast toast-${type}`;

  let icon = '🔔';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'info') icon = 'ℹ️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close-btn" aria-label="Close Notification">&times;</button>
  `;

  container.appendChild(toast);

  // Close on click
  toast.querySelector('.toast-close-btn').addEventListener('click', () => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 400);
  });

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 400);
    }
  }, 4000);
}

// ---------------------------------------------------------------------------
// PROJECTS FILTERING CONTROLLER
// ---------------------------------------------------------------------------
function initProjectsFilter() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const projectCards = document.querySelectorAll('.project-card');

  if (!filterBtns.length || !projectCards.length) return;

  filterBtns.forEach(btn => {
    btn.removeEventListener('click', handleFilterClick);
    btn.addEventListener('click', handleFilterClick);
  });
}

function handleFilterClick(e) {
  const btn = e.currentTarget;
  const filterValue = btn.getAttribute('data-filter');

  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');

  const projectCards = document.querySelectorAll('.project-card');
  projectCards.forEach(card => {
    const category = card.getAttribute('data-category');
    if (filterValue === 'all' || category === filterValue) {
      card.classList.remove('fade-out');
    } else {
      card.classList.add('fade-out');
    }
  });
}

// ---------------------------------------------------------------------------
// DEVELOPER ANALYTICS & HUB PIPELINE
// ---------------------------------------------------------------------------
function initDeveloperInsights() {
  // 1. Populate GitHub Contributions Commits Grid (once only)
  const commitsContainer = document.getElementById('github-commits-container');
  if (commitsContainer && !commitsContainer.dataset.rendered) {
    commitsContainer.dataset.rendered = '1';
    let html = '';
    for (let w = 0; w < 52; w++) {
      html += `<div class="github-week-col">`;
      for (let d = 0; d < 7; d++) {
        const seed = Math.sin(w * 13 + d * 37);
        let level = 0;
        if (seed > 0.6) level = 4;
        else if (seed > 0.2) level = 3;
        else if (seed > -0.2) level = 2;
        else if (seed > -0.6) level = 1;
        html += `<span class="commit-box level-${level}" title="Contributions: ${Math.floor(Math.abs(seed)*12)} on week ${w+1}, day ${d+1}"></span>`;
      }
      html += `</div>`;
    }
    commitsContainer.innerHTML = html;
  }

  // 2. Load and Increment Global Recruiter Session Count from API (deferred)
  async function fetchVisitorCount() {
    try {
      const res = await fetch('/api/status/visitors');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.count) {
          const valText = document.getElementById('visitor-count-text');
          const footText = document.getElementById('footer-visitor-count');
          const countStr = `${data.count} Node Sessions`;
          if (valText) valText.textContent = countStr;
          if (footText) footText.textContent = `Recruiter Node Views: ${data.count}`;
        }
      }
    } catch (err) {
      console.error('Error fetching visitor counter:', err);
    }
  }
  if (window.requestIdleCallback) {
    requestIdleCallback(() => fetchVisitorCount(), { timeout: 2000 });
  } else {
    setTimeout(fetchVisitorCount, 500);
  }
}

// ---------------------------------------------------------------------------
// STATS COUNT-UP ANIMATION MODULE
// ---------------------------------------------------------------------------
function initStatsCountUp() {
  const stats = document.querySelectorAll('.stat-num');
  if (!stats.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.getAttribute('data-target') || '0', 10);
        const suffix = el.getAttribute('data-suffix') || '';
        let start = 0;
        const duration = 1500; // 1.5 seconds total
        const stepTime = Math.abs(Math.floor(duration / target));

        if (target > 0) {
          const timer = setInterval(() => {
            start++;
            el.textContent = start + suffix;
            if (start >= target) {
              el.textContent = target + suffix;
              clearInterval(timer);
            }
          }, Math.max(stepTime, 20));
        } else {
          el.textContent = el.getAttribute('data-target') + suffix;
        }
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.1 });

  stats.forEach(s => observer.observe(s));
}


// ===========================================================================
// VIEW 2: AUTH (LOGIN + SIGNUP)
// ===========================================================================
let authInited = false;

function initAuthView(activeTab) {
  // Switch the visible tab
  const loginPanel = document.getElementById('tab-login');
  const signupPanel = document.getElementById('tab-signup');
  const loginTabBtn = document.getElementById('tab-login-btn');
  const signupTabBtn = document.getElementById('tab-signup-btn');

  if (activeTab === 'signup') {
    loginPanel.classList.remove('active'); signupPanel.classList.add('active');
    loginTabBtn.classList.remove('active'); loginTabBtn.setAttribute('aria-selected','false');
    signupTabBtn.classList.add('active'); signupTabBtn.setAttribute('aria-selected','true');
    document.getElementById('auth-view-title').textContent = 'Create Account';
    document.getElementById('auth-view-subtitle').textContent = 'Build your portfolio in minutes';
  } else {
    signupPanel.classList.remove('active'); loginPanel.classList.add('active');
    signupTabBtn.classList.remove('active'); signupTabBtn.setAttribute('aria-selected','false');
    loginTabBtn.classList.add('active'); loginTabBtn.setAttribute('aria-selected','true');
    document.getElementById('auth-view-title').textContent = 'Welcome Back';
    document.getElementById('auth-view-subtitle').textContent = 'Sign in to access your AuraPort dashboard';
  }

  if (authInited) return;
  authInited = true;

  // Tab button listeners
  loginTabBtn.addEventListener('click', () => navigate('login'));
  signupTabBtn.addEventListener('click', () => navigate('signup'));

  // --- LOGIN FORM ---
  const loginForm = document.getElementById('login-form');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginStatus = document.getElementById('login-status');
  const loginSubmit = document.getElementById('login-submit-btn');
  const toggleLoginPw = document.getElementById('toggle-login-pw');

  toggleLoginPw?.addEventListener('click', () => {
    const t = loginPassword.type === 'password' ? 'text' : 'password';
    loginPassword.type = t;
    toggleLoginPw.textContent = t === 'password' ? 'Show' : 'Hide';
  });

  const validateLoginField = (input) => {
    const err = input.parentNode.querySelector('.error-msg');
    if (!input.checkValidity()) {
      if (err) err.textContent = input.type === 'email' ? 'Please enter a valid email.' : 'This field is required.';
      return false;
    }
    if (err) err.textContent = '';
    return true;
  };

  [loginEmail, loginPassword].forEach(i => {
    i?.addEventListener('blur', () => validateLoginField(i));
    i?.addEventListener('input', () => { if (i.checkValidity()) { const e = i.parentNode.querySelector('.error-msg'); if (e) e.textContent = ''; } });
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateLoginField(loginEmail) | !validateLoginField(loginPassword)) return;

    loginSubmit.disabled = true;
    const sp = loginSubmit.querySelector('.loader-spinner');
    if (sp) sp.style.display = 'inline-block';
    loginStatus.textContent = 'Authenticating...'; loginStatus.className = 'form-status';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.value.trim(), password: loginPassword.value })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        sessionStorage.setItem('admin_token', data.token);
        sessionStorage.setItem('admin_user', data.userId || data.username || 'admin');
        loginStatus.textContent = 'Success! Loading dashboard...'; loginStatus.className = 'form-status success';
        dispatchAuthChange();

        // Check if fresh user needs setup
        try {
          const pRes = await fetch(`/api/portfolio?user=${data.userId || data.username}`);
            if (pRes.ok) {
              const portfolio = await pRes.json();
              if (!portfolio.profile?.name || portfolio.profile.name === 'Your Name') {
                navigate('setup'); return;
              }
          }
        } catch (_) {}

        navigate('admin');
      } else {
        loginStatus.textContent = data.error || 'Invalid credentials.'; loginStatus.className = 'form-status error';
        loginPassword.value = '';
      }
    } catch (err) {
      loginStatus.textContent = 'Connection failed.'; loginStatus.className = 'form-status error';
    } finally {
      loginSubmit.disabled = false; if (sp) sp.style.display = 'none';
    }
  });

  // --- SIGNUP FORM ---
  const signupForm = document.getElementById('signup-form');
  const signupEmail = document.getElementById('signup-email');
  const signupPassword = document.getElementById('signup-password');
  const signupStatus = document.getElementById('signup-status');
  const signupSubmit = document.getElementById('signup-submit-btn');
  const toggleSignupPw = document.getElementById('toggle-signup-pw');

  toggleSignupPw?.addEventListener('click', () => {
    const t = signupPassword.type === 'password' ? 'text' : 'password';
    signupPassword.type = t;
    toggleSignupPw.textContent = t === 'password' ? 'Show' : 'Hide';
  });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validateSignupField = (input) => {
    const err = input.parentNode.querySelector('.error-msg');
    let valid = input.checkValidity();
    if (valid && input.id === 'signup-email') valid = emailRegex.test(input.value.trim());
    if (!valid) {
      if (err) err.textContent = input.validity.valueMissing ? 'Required.' : input.id === 'signup-email' ? 'Enter a valid email address.' : input.validity.tooShort ? `Min ${input.minLength} characters.` : 'Please enter a valid value.';
      return false;
    }
    if (err) err.textContent = ''; return true;
  };

  [signupEmail, signupPassword].forEach(i => {
    i?.addEventListener('blur', () => validateSignupField(i));
    i?.addEventListener('input', () => { if (validateSignupField(i)) { const e = i.parentNode.querySelector('.error-msg'); if (e) e.textContent = ''; } });
  });

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateSignupField(signupEmail) | !validateSignupField(signupPassword)) return;

    signupSubmit.disabled = true;
    const sp = signupSubmit.querySelector('.loader-spinner');
    if (sp) sp.style.display = 'inline-block';
    signupStatus.textContent = 'Creating account...'; signupStatus.className = 'form-status';

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail.value.trim(), password: signupPassword.value })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        sessionStorage.setItem('admin_token', data.token);
        sessionStorage.setItem('admin_user', data.userId || data.username || signupEmail.value.trim());
        signupStatus.textContent = 'Account created! Launching setup wizard...'; signupStatus.className = 'form-status success';
        dispatchAuthChange();
        setTimeout(() => navigate('setup'), 1000);
      } else {
        signupStatus.textContent = data.error || 'Registration failed.'; signupStatus.className = 'form-status error';
      }
    } catch (err) {
      signupStatus.textContent = 'Connection failed.'; signupStatus.className = 'form-status error';
    } finally {
      signupSubmit.disabled = false; if (sp) sp.style.display = 'none';
    }
  });
}


// ===========================================================================
// VIEW 3: SETUP WIZARD
// ===========================================================================
let setupInited = false;

function initSetupView() {
  const sessionToken = sessionStorage.getItem('admin_token');
  const sessionUser  = sessionStorage.getItem('admin_user') || 'admin';
  if (!sessionToken) { navigate('login'); return; }

  if (setupInited) return;
  setupInited = true;

  // State
  let portfolioData = {
    profile: { name:'', title:'', subtitle:'', location:'Seattle, WA', education:'B.S. in Computer Science', specialization:'Full-Stack Engineering', email:'', github:'https://github.com', linkedin:'https://linkedin.com', twitter:'https://twitter.com', hasResume:false },
    stats: [{ num:'3+', lbl:'Years Industry Experience' },{ num:'12+', lbl:'Successful Projects' },{ num:'95%', lbl:'Accuracy Rate' },{ num:'10+', lbl:'Certifications' }],
    skills: [
      { category:'frontend', name:'HTML5 (Semantic & Accessible)', level:95 },
      { category:'frontend', name:'CSS3 (Flexbox/Grid, OKLCH)', level:90 },
      { category:'frontend', name:'Modern JS (ES6+, Web APIs)', level:92 },
      { category:'backend',  name:'Node.js / Express.js Servers', level:88 },
      { category:'backend',  name:'API Design (REST & WebSockets)', level:85 },
      { category:'systems',  name:'Git / GitHub Workflows', level:90 }
    ],
    projects: [
      { id:'workspace', title:'Synapse Collaboration Cloud', meta:'Node.js • WebSockets • Real-time', desc:'AI-powered real-time collaborative workspace.', techs:['HTML5','CSS3 Grid','Node.js','Express','WebSockets'], details:'Developed to allow microsecond synchronization between collaborative editors.', gradientClass:'visual-synapse', tag:'<Workspace/>' },
      { id:'analytics', title:'Zenith Finance Analytics', meta:'Analytics • Responsive SVG', desc:'Financial intelligence panel with SVG graphing.', techs:['Express.js','SVG Graphics','JWT Auth','CSS Themes'], details:'Implemented high-density data parsing with glassmorphism layers.', gradientClass:'visual-zenith', tag:'$ Zenith API' },
      { id:'telemetry', title:'Vapor System Monitor', meta:'Systems • Log Analytics', desc:'Automated diagnostic pipeline for host configurations.', techs:['Node.js Cluster','Express Routing','JSON Logger','Nodemailer'], details:'Tracks system health and issues immediate warnings when thresholds breach.', gradientClass:'visual-vapor', tag:'📡 Telemetry' }
    ]
  };

  let currentStep = 1;
  const totalSteps = 5;

  const wizardCard    = document.getElementById('wizard-card');
  const parsingLoader = document.getElementById('parsing-loader');
  const logStream     = document.getElementById('log-stream');
  const btnBack       = document.getElementById('btn-back');
  const btnNext       = document.getElementById('btn-next');
  const progressFill  = document.getElementById('progress-fill');
  const setupStatus   = document.getElementById('setup-status');
  const dropzone      = document.getElementById('dropzone');
  const resumeInput   = document.getElementById('resume-input');
  const choiceManual  = document.getElementById('choice-manual');
  const btnAddSkill   = document.getElementById('btn-add-skill');

  // Manual path
  choiceManual.addEventListener('click', () => transitionToStep(2));
  choiceManual.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') transitionToStep(2); });

  // Dropzone
  ['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
  dropzone.addEventListener('drop', e => { const f = e.dataTransfer?.files[0]; if (f) handleResumeFile(f); });
  resumeInput.addEventListener('change', e => { const f = e.target.files[0]; if (f) handleResumeFile(f); });

  // Quick Start
  const choiceQuick  = document.getElementById('choice-quickstart');
  const quickForm    = document.getElementById('quickstart-form');
  const quickName    = document.getElementById('quick-name');
  const quickTitle   = document.getElementById('quick-title');
  const quickGoBtn   = document.getElementById('quickstart-go-btn');
  const quickCancel  = document.getElementById('quickstart-cancel-btn');

  function hideAllInlineForms() {
    quickForm.style.display = 'none';
    document.getElementById('github-form').style.display = 'none';
    document.querySelectorAll('.choice-grid .choice-card').forEach(c => c.style.display = '');
  }

  choiceQuick.addEventListener('click', () => {
    document.querySelectorAll('.choice-grid .choice-card').forEach(c => c.style.display = 'none');
    quickForm.style.display = 'block';
  });
  choiceQuick.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { document.querySelectorAll('.choice-grid .choice-card').forEach(c => c.style.display = 'none'); quickForm.style.display = 'block'; } });

  quickCancel.addEventListener('click', hideAllInlineForms);

  quickGoBtn.addEventListener('click', async () => {
    const name  = quickName.value.trim();
    const title = quickTitle.value.trim();
    if (!name || !title) { alert('Please enter both your name and title.'); return; }

    portfolioData = {
      profile: { name, title, subtitle:'Welcome to my portfolio', location:'', education:'', specialization:'', email:'', github:'', linkedin:'', twitter:'', hasResume:false },
      stats: [],
      skills: [],
      projects: [],
      recommendations: []
    };

    try {
      const res = await fetch('/api/portfolio/import-resume', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickStart: true, name, title })
      });
      if (!res.ok) throw new Error('Server error.');
      const result = await res.json();
      portfolioData = result.data;
    } catch (err) {
      // Fallback: save minimal data manually
      portfolioData.profile.hasResume = false;
    }

    setupInited = false;
    navigate('portfolio', { user: sessionUser });
  });

  // GitHub Import
  const choiceGitHub   = document.getElementById('choice-github');
  const githubForm     = document.getElementById('github-form');
  const githubUsername = document.getElementById('github-username');
  const githubImportBtn= document.getElementById('github-import-btn');
  const githubCancelBtn= document.getElementById('github-cancel-btn');
  const githubStatus   = document.getElementById('github-status');

  choiceGitHub.addEventListener('click', () => {
    document.querySelectorAll('.choice-grid .choice-card').forEach(c => c.style.display = 'none');
    githubForm.style.display = 'block';
  });
  choiceGitHub.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { document.querySelectorAll('.choice-grid .choice-card').forEach(c => c.style.display = 'none'); githubForm.style.display = 'block'; } });

  githubCancelBtn.addEventListener('click', hideAllInlineForms);

  githubImportBtn.addEventListener('click', async () => {
    const username = githubUsername.value.trim();
    if (!username) { alert('Please enter a GitHub username.'); return; }
    githubStatus.textContent = '⏳ Fetching GitHub profile...';
    githubImportBtn.disabled = true;

    try {
      // Fetch user profile
      const userRes = await fetch(`https://api.github.com/users/${username}`);
      if (!userRes.ok) throw new Error('GitHub user not found.');
      const user = await userRes.json();

      githubStatus.textContent = '⏳ Fetching repositories...';

      // Fetch repos (up to 30)
      const reposRes = await fetch(`https://api.github.com/users/${username}/repos?per_page=30&sort=updated`);
      if (!reposRes.ok) throw new Error('Could not fetch repositories.');
      const repos = await reposRes.json();

      githubStatus.textContent = '⏳ Building portfolio...';

      // Build skills from languages used across repos
      const langCount = {};
      for (const repo of repos.slice(0, 10)) {
        if (repo.language) {
          langCount[repo.language] = (langCount[repo.language] || 0) + 1;
        }
      }
      const topLangs = Object.entries(langCount).sort((a,b) => b[1]-a[1]).slice(0,6);

      const skills = topLangs.map(([lang, count], i) => ({
        category: ['frontend','backend','systems','ai-ml'][i % 4],
        name: `${lang} Development`,
        level: Math.min(100, 75 + count * 3)
      }));

      if (!skills.length) {
        skills.push({ category:'frontend', name:'Web Development', level:80 });
      }

      // Build projects from repos
      const projects = repos
        .filter(r => !r.fork && r.description)
        .slice(0, 6)
        .map((repo, i) => {
          const desc = repo.description || 'A project built with passion.';
          const lang = repo.language || 'JavaScript';
          const cat  = ['frontend','backend','ai-ml','frontend','backend','systems'][i % 6];
          return {
            id: repo.name.replace(/[^a-zA-Z0-9]/g,'-').toLowerCase().slice(0,30),
            title: repo.name.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase()),
            meta: `${lang} • ${repo.stargazers_count} stars`,
            desc: desc.slice(0, 120),
            techs: [lang],
            details: desc.slice(0, 300),
            gradientClass: ['visual-synapse','visual-zenith','visual-vapor','visual-aurora','visual-apex','visual-nebula'][i % 6],
            tag: `<${lang}/>`,
            category: cat,
            url: repo.html_url
          };
        });

      portfolioData = {
        profile: {
          name: user.name || username,
          title: user.bio || 'Software Developer',
          subtitle: user.bio || 'Open source enthusiast',
          location: user.location || '',
          education: '',
          specialization: topLangs.map(l => l[0]).join(', ') || 'Software Development',
          email: '',
          github: user.html_url,
          linkedin: '',
          twitter: user.twitter_username ? `https://twitter.com/${user.twitter_username}` : '',
          hasResume: false
        },
        stats: [
          { num:`${user.public_repos}`, lbl:'Public Repositories' },
          { num:`${user.followers}`, lbl:'GitHub Followers' },
          { num:`${topLangs.length}`, lbl:'Core Languages' },
          { num:`${repos.filter(r => r.fork).length}`, lbl:'Forked Contributions' }
        ],
        skills,
        projects,
        recommendations: topLangs.map(l => ({
          skill: l[0],
          reason: `Used in ${l[1]} of your repositories`,
          priority: 'medium'
        }))
      };

      // Save to server
      const res = await fetch('/api/portfolio/import-resume', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickStart: true, name: portfolioData.profile.name, title: portfolioData.profile.title, fullData: portfolioData })
      });

      if (!res.ok) throw new Error('Failed to save portfolio.');

      githubStatus.textContent = '✅ Portfolio generated! Redirecting...';

      setTimeout(() => {
        setupInited = false;
        navigate('portfolio', { user: sessionUser });
      }, 800);

    } catch (err) {
      githubStatus.textContent = `❌ ${err.message}`;
      githubImportBtn.disabled = false;
    }
  });

  function addLog(text, delay=0) {
    return new Promise(resolve => setTimeout(() => {
      const line = document.createElement('div');
      line.className = 'log-line';
      line.textContent = `> ${text}`;
      logStream.appendChild(line);
      logStream.scrollTop = logStream.scrollHeight;
      resolve();
    }, delay));
  }

  async function handleResumeFile(file) {
    if (file.type !== 'application/pdf') { alert('Please upload a PDF file.'); return; }

    wizardCard.style.display = 'none';
    parsingLoader.style.display = 'flex';
    logStream.innerHTML = '<div class="log-line">&gt; Initiating engine...</div>';

    await addLog(`File: ${file.name} (${Math.round(file.size/1024)} KB)`, 200);
    await addLog('Uploading resume to parser API...', 300);

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const res = await fetch('/api/portfolio/import-resume', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionToken}` },
        body: formData
      });
      await addLog('Response received! Parsing content...', 400);

      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Server error.'); }

      const result = await res.json();
      portfolioData = result.data;

      await addLog('Contact channels and name identified...', 400);
      await addLog(`Profile: "${portfolioData.profile.name}"`, 300);
      await addLog(`Mapped ${portfolioData.skills.length} skills successfully.`, 300);
      await addLog('Structuring showcase portfolio cards...', 400);
      await addLog('Extraction complete! Generating your portfolio...', 500);

      setTimeout(() => {
        parsingLoader.style.display = 'none';
        setupInited = false;
        navigate('portfolio', { user: sessionUser });
      }, 800);

    } catch (err) {
      await addLog(`[ERROR] ${err.message}`, 200);
      await addLog('Falling back to manual form...', 500);
      setTimeout(() => {
        parsingLoader.style.display = 'none';
        wizardCard.style.display = 'block';
        transitionToStep(2);
      }, 1500);
    }
  }

  function populateFormUI() {
    document.getElementById('profile-name').value          = portfolioData.profile.name || '';
    document.getElementById('profile-title').value         = portfolioData.profile.title || '';
    document.getElementById('profile-subtitle').value      = portfolioData.profile.subtitle || '';
    document.getElementById('profile-location').value      = portfolioData.profile.location || '';
    document.getElementById('profile-email').value         = portfolioData.profile.email || '';
    document.getElementById('profile-education').value     = portfolioData.profile.education || '';
    document.getElementById('profile-specialization').value= portfolioData.profile.specialization || '';
    document.getElementById('profile-github').value        = portfolioData.profile.github || '';
    document.getElementById('profile-linkedin').value      = portfolioData.profile.linkedin || '';
    document.getElementById('profile-twitter').value       = portfolioData.profile.twitter || '';

    portfolioData.stats.forEach((s, i) => {
      if (i < 4) {
        document.getElementById(`stat-num-${i}`).value = s.num || '';
        document.getElementById(`stat-lbl-${i}`).value = s.lbl || '';
      }
    });

    paintSkills();
    paintProjects();
  }

  function paintSkills() {
    ['frontend','backend','systems'].forEach(cat => {
      const list = document.getElementById(`skills-list-${cat}`);
      list.innerHTML = '';
      const filtered = portfolioData.skills.filter(s => s.category === cat);
      if (!filtered.length) {
        list.innerHTML = `<div style="text-align:center;color:var(--color-text-muted);font-size:0.9rem;padding:1rem 0;">No skills in this category yet.</div>`;
        return;
      }
      filtered.forEach((skill) => {
        const item = document.createElement('div');
        item.className = 'dynamic-item';
        item.innerHTML = `
          <div style="font-weight:600;font-size:1rem;">${skill.name}</div>
          <div class="slider-row">
            <input type="range" min="0" max="100" value="${skill.level}">
            <span class="slider-value">${skill.level}%</span>
          </div>
          <button type="button" class="delete-item-btn" aria-label="Remove skill">&times;</button>
        `;
        const slider = item.querySelector('input[type="range"]');
        const val    = item.querySelector('.slider-value');
        slider.addEventListener('input', e => { val.textContent = `${e.target.value}%`; skill.level = parseInt(e.target.value); });
        item.querySelector('.delete-item-btn').addEventListener('click', () => {
          portfolioData.skills = portfolioData.skills.filter(s => s !== skill);
          paintSkills();
        });
        list.appendChild(item);
      });
    });
  }

  btnAddSkill?.addEventListener('click', () => {
    const name = document.getElementById('new-skill-name').value.trim();
    const cat  = document.getElementById('new-skill-category').value;
    if (!name) { alert('Please enter a skill name.'); return; }
    portfolioData.skills.push({ category: cat, name, level: 85 });
    document.getElementById('new-skill-name').value = '';
    paintSkills();
  });

  function paintProjects() {
    const container = document.getElementById('projects-container');
    container.innerHTML = '';

    portfolioData.projects.forEach((proj, idx) => {
      const item = document.createElement('div');
      item.className = 'dynamic-item';
      item.innerHTML = `
        <div style="font-weight:700;font-size:1.15rem;color:var(--color-primary);margin-bottom:0.5rem;">Showcase Project #${idx+1}</div>
        <div class="form-group"><label>Project Title <span class="required">*</span></label><input type="text" id="proj-title-${idx}" required value="${proj.title||''}"></div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem;">
          <div class="form-group"><label>Metadata Subtitle <span class="required">*</span></label><input type="text" id="proj-meta-${idx}" required value="${proj.meta||''}" placeholder="Analytics • SVG Layout"></div>
          <div class="form-group"><label>Pill Tag <span class="required">*</span></label><input type="text" id="proj-tag-${idx}" required value="${proj.tag||''}" placeholder="&lt;Workspace/&gt;"></div>
        </div>
        <div class="form-group"><label>Short Description <span class="required">*</span></label><input type="text" id="proj-desc-${idx}" required value="${proj.desc||''}"></div>
        <div class="form-group"><label>Technical Details <span class="required">*</span></label><textarea id="proj-details-${idx}" required>${proj.details||''}</textarea></div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem;">
          <div class="form-group">
            <label>Category</label>
            <select id="proj-category-${idx}" style="width:100%;height:48px;padding:0.75rem;border-radius:var(--border-radius-sm);border:1px solid var(--color-card-border);background:var(--color-bg);color:var(--color-text);">
              <option value="frontend" ${proj.category==='frontend'?'selected':''}>Frontend UI/UX</option>
              <option value="backend" ${proj.category==='backend'?'selected':''}>Backend Servers</option>
              <option value="ai-ml" ${proj.category==='ai-ml'?'selected':''}>AI &amp; Systems</option>
            </select>
          </div>
          <div class="form-group">
            <label>Gradient Style</label>
            <div class="gradient-select">
              <div class="gradient-opt ${proj.gradientClass==='visual-synapse'?'active':''}" data-val="visual-synapse">Purple Aura</div>
              <div class="gradient-opt ${proj.gradientClass==='visual-zenith'?'active':''}" data-val="visual-zenith">Teal Frost</div>
              <div class="gradient-opt ${proj.gradientClass==='visual-vapor'?'active':''}" data-val="visual-vapor">Orange Telemetry</div>
            </div>
          </div>
        </div>
        <div class="form-group"><label>Technologies (comma separated)</label><input type="text" id="proj-techs-${idx}" value="${(proj.techs||[]).join(', ')}" placeholder="React, Node.js, WebSockets"></div>
      `;

      item.querySelector(`#proj-title-${idx}`).addEventListener('input',   e => { proj.title = e.target.value; });
      item.querySelector(`#proj-meta-${idx}`).addEventListener('input',    e => { proj.meta  = e.target.value; });
      item.querySelector(`#proj-tag-${idx}`).addEventListener('input',     e => { proj.tag   = e.target.value; });
      item.querySelector(`#proj-desc-${idx}`).addEventListener('input',    e => { proj.desc  = e.target.value; });
      item.querySelector(`#proj-details-${idx}`).addEventListener('input', e => { proj.details = e.target.value; });
      item.querySelector(`#proj-techs-${idx}`).addEventListener('input',   e => { proj.techs = e.target.value.split(',').map(t=>t.trim()).filter(Boolean); });
      item.querySelector(`#proj-category-${idx}`).addEventListener('change', e => { proj.category = e.target.value; });

      item.querySelectorAll('.gradient-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          item.querySelectorAll('.gradient-opt').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          proj.gradientClass = opt.getAttribute('data-val');
        });
      });

      container.appendChild(item);
    });
  }

  populateFormUI();

  function validateSetupField(input) {
    if (!input) return true;
    const err = input.parentNode?.querySelector('.error-msg');
    if (!input.checkValidity()) { if (err) err.textContent = 'Required.'; input.classList.add('invalid'); return false; }
    if (err) err.textContent = ''; input.classList.remove('invalid'); return true;
  }

  function validateStep(step) {
    let valid = true;
    if (step === 2) {
      ['profile-name','profile-title','profile-subtitle','profile-email'].forEach(id => {
        if (!validateSetupField(document.getElementById(id))) valid = false;
      });
    } else if (step === 3) {
      for (let i=0;i<4;i++) {
        if (!validateSetupField(document.getElementById(`stat-num-${i}`))) valid = false;
        if (!validateSetupField(document.getElementById(`stat-lbl-${i}`))) valid = false;
      }
    } else if (step === 5) {
      for (let i=0;i<3;i++) {
        ['proj-title','proj-meta','proj-tag','proj-desc','proj-details'].forEach(prefix => {
          if (!validateSetupField(document.getElementById(`${prefix}-${i}`))) valid = false;
        });
      }
    }
    if (!valid) { setupStatus.textContent = 'Please fill out all required fields.'; setupStatus.className = 'form-status error'; }
    return valid;
  }

  function transitionToStep(target) {
    if (target < 1 || target > totalSteps) return;
    if (target > currentStep && currentStep > 1 && !validateStep(currentStep)) return;

    document.getElementById(`step-content-${currentStep}`)?.classList.remove('active');
    document.getElementById(`step-nav-${currentStep}`)?.classList.remove('active');
    if (currentStep < target) document.getElementById(`step-nav-${currentStep}`)?.classList.add('completed');
    else document.getElementById(`step-nav-${target}`)?.classList.remove('completed');

    document.getElementById(`step-content-${target}`)?.classList.add('active');
    document.getElementById(`step-nav-${target}`)?.classList.add('active');

    wizardCard.scrollIntoView({ behavior:'smooth', block:'start' });
    currentStep = target;

    btnBack.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
    const nextLabel = btnNext.querySelector('span');
    if (nextLabel) nextLabel.textContent = currentStep === totalSteps ? 'Finish Setup' : 'Next';

    progressFill.style.width = `${((currentStep-1)/(totalSteps-1))*100}%`;
    setupStatus.textContent = '';
  }

  btnBack?.addEventListener('click', () => transitionToStep(currentStep - 1));

  btnNext?.addEventListener('click', async () => {
    if (currentStep < totalSteps) {
      transitionToStep(currentStep + 1);
      return;
    }

    if (!validateStep(5)) return;

    btnNext.disabled = true;
    const sp = btnNext.querySelector('.loader-spinner');
    if (sp) sp.style.display = 'inline-block';
    setupStatus.textContent = 'Saving portfolio...'; setupStatus.className = 'form-status';

    // Collect final state from form fields
    portfolioData.profile.name           = document.getElementById('profile-name').value.trim();
    portfolioData.profile.title          = document.getElementById('profile-title').value.trim();
    portfolioData.profile.subtitle       = document.getElementById('profile-subtitle').value.trim();
    portfolioData.profile.location       = document.getElementById('profile-location').value.trim();
    portfolioData.profile.email          = document.getElementById('profile-email').value.trim();
    portfolioData.profile.education      = document.getElementById('profile-education').value.trim();
    portfolioData.profile.specialization = document.getElementById('profile-specialization').value.trim();
    portfolioData.profile.github         = document.getElementById('profile-github').value.trim();
    portfolioData.profile.linkedin       = document.getElementById('profile-linkedin').value.trim();
    portfolioData.profile.twitter        = document.getElementById('profile-twitter').value.trim();

    portfolioData.stats = [];
    for (let i=0;i<4;i++) {
      portfolioData.stats.push({
        num: document.getElementById(`stat-num-${i}`).value.trim(),
        lbl: document.getElementById(`stat-lbl-${i}`).value.trim()
      });
    }

    try {
      const res = await fetch('/api/portfolio', {
        method:'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${sessionToken}` },
        body: JSON.stringify(portfolioData)
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setupStatus.textContent = 'Portfolio created! Launching showcase...'; setupStatus.className = 'form-status success';
        navigate('portfolio', { user: sessionUser });
      } else {
        throw new Error(result.error || 'Failed to save.');
      }
    } catch (err) {
      setupStatus.textContent = `Error: ${err.message}`; setupStatus.className = 'form-status error';
      btnNext.disabled = false; if (sp) sp.style.display = 'none';
    }
  });

  // Reattach blur listeners dynamically
  document.querySelectorAll('#setup-wizard-form input, #setup-wizard-form textarea').forEach(el => {
    el.addEventListener('blur', () => validateSetupField(el));
    el.addEventListener('input', () => { if (el.checkValidity()) { el.classList.remove('invalid'); const e = el.parentNode?.querySelector('.error-msg'); if (e) e.textContent=''; } });
  });
}


// ===========================================================================
// VIEW 4: ADMIN DASHBOARD
// ===========================================================================
let adminInited = false;

function initAdminView() {
  const token    = sessionStorage.getItem('admin_token');
  const username = sessionStorage.getItem('admin_user') || 'admin';
  if (!token) { navigate('login'); return; }

  // Show username in header and sidebar
  const sessionEl = document.getElementById('session-username');
  if (sessionEl) sessionEl.textContent = `@${username}`;
  const sidebarUser = document.getElementById('admin-sidebar-user');
  if (sidebarUser) sidebarUser.textContent = username;

  if (adminInited) {
    // Just re-fetch fresh data
    fetchAdminPortfolio(token, username);
    return;
  }
  adminInited = true;

  let portfolioData    = null;
  let inMemorySkills   = [];
  let inMemoryProjects = [];

  const tabButtons  = document.querySelectorAll('#view-admin .admin-tab-btn');
  const tabPanels   = document.querySelectorAll('#view-admin .admin-tab-panel');
  const globalLoader = document.getElementById('dashboard-global-loader');
  const logoutBtn    = document.getElementById('logout-btn');
  const downloadPortfolioBtn = document.getElementById('download-portfolio-btn');
  const portfolioForm = document.getElementById('portfolio-data-form');
  const saveAllBtn    = document.getElementById('save-all-btn');
  const globalSaveStatus = document.getElementById('global-save-status');

  // Tab nav
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabPanels.forEach(p => p.classList.toggle('active', p.id === target));
    });
  });

  // Logout
  logoutBtn?.addEventListener('click', () => {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_user');
    dispatchAuthChange();
    navigate('portfolio');
  });

  // Download current portfolio export
  downloadPortfolioBtn?.addEventListener('click', async () => {
    if (!downloadPortfolioBtn) return;
    downloadPortfolioBtn.disabled = true;
    downloadPortfolioBtn.textContent = 'Preparing package...';

    try {
      const response = await fetch('/api/portfolio/export', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Export failed.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${username}-portfolio-export.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      downloadPortfolioBtn.textContent = 'Package ready!';
    } catch (exportError) {
      alert(exportError.message || 'Unable to export portfolio.');
      downloadPortfolioBtn.textContent = 'Download Portfolio Package';
    } finally {
      setTimeout(() => {
        if (downloadPortfolioBtn) {
          downloadPortfolioBtn.disabled = false;
          downloadPortfolioBtn.textContent = '⬇️ Download Portfolio Package';
        }
      }, 1500);
    }
  });

  // Fetch
  async function fetchAdminPortfolio(tok, user) {
    try {
      const res = await fetch(`/api/portfolio?user=${encodeURIComponent(user)}`);
      if (!res.ok) throw new Error('Failed to load portfolio.');
      portfolioData = await res.json();

      if (portfolioData.profile?.name) {
        const logoEl = document.getElementById('admin-logo-text');
        if (logoEl) {
          const parts = portfolioData.profile.name.split(' ');
          logoEl.textContent = parts.length >= 2 ? `${parts[0]}.${parts[1][0]}` : portfolioData.profile.name;
        }
      }

      inMemorySkills   = [...portfolioData.skills];
      inMemoryProjects = [...portfolioData.projects];

      populateAdminProfile();
      populateAdminStats();
      renderSkillsTable();
      renderProjectsList();
      updateResumeLabel();

      if (globalLoader) { globalLoader.style.opacity = '0'; setTimeout(() => { globalLoader.style.display='none'; }, 300); }
    } catch (err) {
      console.error('[Admin Fetch Error]', err);
      alert('An unexpected error occurred while loading the dashboard. Please try again later.');
    }
  }

  function populateAdminProfile() {
    const p = portfolioData.profile;
    if (!p) return;
    document.getElementById('admin-profile-name').value           = p.name || '';
    document.getElementById('admin-profile-title').value          = p.title || '';
    document.getElementById('admin-profile-subtitle').value       = p.subtitle || '';
    document.getElementById('admin-profile-location').value       = p.location || '';
    document.getElementById('admin-profile-education').value      = p.education || '';
    document.getElementById('admin-profile-specialization').value = p.specialization || '';
    document.getElementById('admin-profile-email').value          = p.email || '';
    document.getElementById('admin-profile-github').value         = p.github || '';
    document.getElementById('admin-profile-linkedin').value       = p.linkedin || '';
    document.getElementById('admin-profile-twitter').value        = p.twitter || '';
  }

  function populateAdminStats() {
    const container = document.getElementById('stats-inputs-container');
    if (!container) return;
    const stats = portfolioData.stats || [];
    while (stats.length < 4) stats.push({ num:'0', lbl:'New Stat' });
    container.innerHTML = '';
    stats.slice(0,4).forEach((s, i) => {
      container.insertAdjacentHTML('beforeend', `
        <div class="admin-stat-card-inputs glass-float-card-static" data-stat-index="${i}">
          <h3 class="stat-card-label-heading">Metric Card ${i+1}</h3>
          <div class="form-group"><label for="stat-num-${i}">Value <span class="required">*</span></label><input type="text" id="stat-num-${i}" value="${s.num}" required placeholder="5+"></div>
          <div class="form-group"><label for="stat-lbl-${i}">Description <span class="required">*</span></label><input type="text" id="stat-lbl-${i}" value="${s.lbl}" required placeholder="Years Experience"></div>
        </div>
      `);
    });
  }

  function renderSkillsTable() {
    const tbody = document.getElementById('skills-crud-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    inMemorySkills.forEach((skill, i) => {
      const row = document.createElement('tr');
      row.setAttribute('data-skill-index', i);
      row.innerHTML = `
        <td><input type="text" class="table-inline-input skill-name-input" value="${skill.name}" required></td>
        <td><select class="table-inline-select skill-category-select">
          <option value="frontend" ${skill.category==='frontend'?'selected':''}>Frontend</option>
          <option value="backend"  ${skill.category==='backend'?'selected':''}>Backend</option>
          <option value="systems"  ${skill.category==='systems'?'selected':''}>Systems</option>
        </select></td>
        <td><div class="progress-inline-row"><input type="number" class="table-inline-input skill-level-input" value="${skill.level}" min="0" max="100"><span class="pct-sign">%</span></div></td>
        <td class="table-actions-cell"><button type="button" class="btn btn-secondary delete-skill-row-btn" data-index="${i}">Delete</button></td>
      `;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('.delete-skill-row-btn').forEach(btn => {
      btn.addEventListener('click', () => { inMemorySkills.splice(parseInt(btn.getAttribute('data-index')), 1); renderSkillsTable(); });
    });
    tbody.querySelectorAll('.skill-name-input').forEach(inp => {
      inp.addEventListener('change', () => { const i = parseInt(inp.closest('tr').getAttribute('data-skill-index')); inMemorySkills[i].name = inp.value.trim(); });
    });
    tbody.querySelectorAll('.skill-category-select').forEach(sel => {
      sel.addEventListener('change', () => { const i = parseInt(sel.closest('tr').getAttribute('data-skill-index')); inMemorySkills[i].category = sel.value; });
    });
    tbody.querySelectorAll('.skill-level-input').forEach(inp => {
      inp.addEventListener('change', () => { const i = parseInt(inp.closest('tr').getAttribute('data-skill-index')); let v = parseInt(inp.value)||0; v=Math.max(0,Math.min(100,v)); inp.value=v; inMemorySkills[i].level=v; });
    });
  }

  document.getElementById('add-skill-btn')?.addEventListener('click', () => {
    inMemorySkills.push({ category:'frontend', name:'New Tool', level:80 });
    renderSkillsTable();
  });

  function renderProjectsList() {
    const list = document.getElementById('projects-crud-list');
    if (!list) return;
    list.innerHTML = '';
    if (!inMemoryProjects.length) {
      list.innerHTML = '<div class="empty-projects-state"><p>No projects yet. Add one to get started.</p></div>';
      return;
    }
    inMemoryProjects.forEach((proj, i) => {
      const badges = (proj.techs||[]).map(t=>`<span class="modal-tech-badge">${t}</span>`).join('');
      const catLabel = proj.category === 'ai-ml' ? 'AI & Systems' : proj.category === 'frontend' ? 'Frontend UI/UX' : 'Backend Servers';
      list.insertAdjacentHTML('beforeend', `
        <div class="admin-project-crud-card glass-float-card-static" data-project-index="${i}">
          <div class="project-crud-header">
            <div><span class="project-meta">${proj.meta||''}</span><h3 class="project-card-title">${proj.title||'Untitled'}</h3></div>
            <div class="project-crud-actions">
              <button type="button" class="btn btn-secondary edit-project-card-btn" data-index="${i}">Edit</button>
              <button type="button" class="btn btn-secondary delete-project-card-btn" data-index="${i}" style="border-color:var(--color-accent-light);color:var(--color-accent-light);">Delete</button>
            </div>
          </div>
          <p class="project-card-desc">${proj.desc||''}</p>
          <div class="project-badges-row">
            <span class="project-crud-badge-gradient ${proj.gradientClass||'visual-synapse'}">${proj.tag||'<Tag/>'}</span>
            <span class="project-category-badge">${catLabel}</span>
            <div class="project-tech-badges-list">${badges}</div>
          </div>
        </div>
      `);
    });

    list.querySelectorAll('.delete-project-card-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-index'));
        if (confirm(`Delete "${inMemoryProjects[i].title}"?`)) { inMemoryProjects.splice(i,1); renderProjectsList(); }
      });
    });
    list.querySelectorAll('.edit-project-card-btn').forEach(btn => {
      btn.addEventListener('click', () => openProjectEditor(parseInt(btn.getAttribute('data-index'))));
    });
  }

  // Project editor dialog
  const projectModal = document.getElementById('project-edit-modal');
  const projectForm  = document.getElementById('project-edit-form');
  const closeProjectBtn = document.getElementById('close-project-dialog-btn');
  const cancelProjectBtn = document.getElementById('cancel-project-edit-btn');
  const addProjectBtn    = document.getElementById('add-project-btn');

  function openProjectEditor(index = -1) {
    if (!projectModal) return;
    const title = document.getElementById('project-dialog-title');
    const idx   = document.getElementById('edit-project-index');

    if (index >= 0 && index < inMemoryProjects.length) {
      title.textContent = 'Edit Project Details'; idx.value = index;
      const p = inMemoryProjects[index];
      document.getElementById('edit-project-title').value   = p.title || '';
      document.getElementById('edit-project-id').value      = p.id    || '';
      document.getElementById('edit-project-meta').value    = p.meta  || '';
      document.getElementById('edit-project-tag').value     = p.tag   || '';
      document.getElementById('edit-project-gradient').value= p.gradientClass || 'visual-synapse';
      document.getElementById('edit-project-category').value= p.category || 'frontend';
      document.getElementById('edit-project-desc').value    = p.desc    || '';
      document.getElementById('edit-project-details').value = p.details || '';
      document.getElementById('edit-project-techs').value   = (p.techs||[]).join(', ');
    } else {
      title.textContent = 'Add New Project'; idx.value = '-1'; projectForm.reset();
      document.getElementById('edit-project-gradient').value = 'visual-synapse';
    }
    projectModal.showModal();
  }

  addProjectBtn?.addEventListener('click', () => openProjectEditor(-1));
  closeProjectBtn?.addEventListener('click', () => projectModal?.close());
  cancelProjectBtn?.addEventListener('click', () => projectModal?.close());
  projectModal?.addEventListener('click', e => { if (e.target === projectModal) projectModal.close(); });

  projectForm?.addEventListener('submit', e => {
    e.preventDefault();
    if (!projectForm.checkValidity()) { projectForm.reportValidity(); return; }

    const index = parseInt(document.getElementById('edit-project-index').value);
    const payload = {
      id: document.getElementById('edit-project-id').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g,''),
      title:       document.getElementById('edit-project-title').value.trim(),
      meta:        document.getElementById('edit-project-meta').value.trim(),
      tag:         document.getElementById('edit-project-tag').value.trim(),
      gradientClass: document.getElementById('edit-project-gradient').value,
      category:    document.getElementById('edit-project-category').value,
      desc:        document.getElementById('edit-project-desc').value.trim(),
      details:     document.getElementById('edit-project-details').value.trim(),
      techs:       document.getElementById('edit-project-techs').value.split(',').map(t=>t.trim()).filter(Boolean)
    };

    if (index >= 0) inMemoryProjects[index] = payload;
    else inMemoryProjects.push(payload);

    renderProjectsList();
    projectModal?.close();
  });

  // Resume uploader
  function updateResumeLabel() {
    const hasResume = portfolioData?.profile?.hasResume;
    const label  = document.getElementById('resume-active-label');
    const preview = document.getElementById('resume-link-preview');
    if (!label || !preview) return;
    const rawUser = sessionStorage.getItem('admin_user') || portfolioData?.profile?.username || 'admin';
    const safeUser = String(rawUser).trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'admin';
    if (hasResume) {
      preview.className = 'resume-preview-status-box success';
      label.innerHTML = `<strong>Active:</strong> Resume exists. <a href="/api/portfolio/resume?user=${encodeURIComponent(safeUser)}" target="_blank" class="live-resume-anchor">View resume.pdf</a>`;
    } else {
      preview.className = 'resume-preview-status-box';
      label.textContent = 'No resume uploaded yet.';
    }
  }

  const dragZone       = document.getElementById('resume-dragzone');
  const fileInput      = document.getElementById('resume-file-input');
  const uploadContainer = document.getElementById('upload-progress-bar-container');
  const fillProgress   = document.getElementById('upload-active-progress');
  const pctLabel       = document.getElementById('upload-pct-label');
  const uploaderFeedback = document.getElementById('uploader-feedback');

  if (dragZone && fileInput) {
    dragZone.addEventListener('click', () => fileInput.click());
    ['dragenter','dragover'].forEach(ev => dragZone.addEventListener(ev, e => { e.preventDefault(); dragZone.classList.add('highlight-drag'); }));
    ['dragleave','drop'].forEach(ev => dragZone.addEventListener(ev, e => { e.preventDefault(); dragZone.classList.remove('highlight-drag'); }));
    dragZone.addEventListener('drop', e => { const f = e.dataTransfer?.files[0]; if (f) processResumeUpload(f, token); });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) processResumeUpload(fileInput.files[0], token); });
  }

  function showUploadFeedback(msg, type) {
    if (uploaderFeedback) { uploaderFeedback.textContent = msg; uploaderFeedback.className = `form-status ${type}`; }
  }

  function processResumeUpload(file, tok) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { showUploadFeedback('Only PDF files allowed.', 'error'); return; }
    if (file.size > 5*1024*1024) { showUploadFeedback('File exceeds 5MB limit.', 'error'); return; }

    if (uploadContainer) uploadContainer.style.display = 'block';
    if (fillProgress)   fillProgress.style.width = '0%';
    if (pctLabel)       pctLabel.textContent = '0%';
    showUploadFeedback('Uploading...', '');

    const formData = new FormData();
    formData.append('resume', file);
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded/e.total)*100);
        if (fillProgress) fillProgress.style.width = `${pct}%`;
        if (pctLabel) pctLabel.textContent = `${pct}%`;
      }
    });

    xhr.onreadystatechange = async () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && res.success) {
            if (res.data && res.data.profile) {
              pendingParseData = res.data;
              displayParseResultsModal(res.data);
              showUploadFeedback('Resume analyzed! Review below and confirm to apply to portfolio.', 'success');
              applyParsedResumeData();
            } else if (portfolioData?.profile) {
              portfolioData.profile.hasResume = true;
              updateResumeLabel();
              showUploadFeedback('Resume uploaded and saved.', 'success');
            }
          } else {
            showUploadFeedback(res.error || 'Upload failed.', 'error');
          }
        } catch (err) {
          showUploadFeedback('Server response error.', 'error');
        }
        if (fileInput) fileInput.value = '';
        setTimeout(() => { if (uploadContainer) uploadContainer.style.display = 'none'; }, 2000);
      }
    };

    xhr.open('POST', '/api/portfolio/import-resume', true);
    xhr.setRequestHeader('Authorization', `Bearer ${tok}`);
    xhr.send(formData);
  }

  const parseResultModal = document.getElementById('resume-parse-result-modal');
  const closeParseBtn = document.getElementById('close-parse-result-btn');
  const confirmParseBtn = document.getElementById('confirm-parse-result-btn');
  const cancelParseBtn = document.getElementById('cancel-parse-result-btn');
  let pendingParseData = null;

  closeParseBtn?.addEventListener('click', () => parseResultModal?.close());
  cancelParseBtn?.addEventListener('click', () => parseResultModal?.close());

  confirmParseBtn?.addEventListener('click', () => {
    applyParsedResumeData();
  });

  function applyParsedResumeData() {
    if (pendingParseData) {
      portfolioData.profile = pendingParseData.profile;
      portfolioData.stats = pendingParseData.stats || portfolioData.stats;
      portfolioData.skills = pendingParseData.skills || portfolioData.skills;
      portfolioData.projects = pendingParseData.projects || portfolioData.projects;
      inMemorySkills = [...portfolioData.skills];
      inMemoryProjects = [...portfolioData.projects];
      populateAdminProfile();
      populateAdminStats();
      renderSkillsTable();
      renderProjectsList();
      updateResumeLabel();
      parseResultModal?.close();
      console.log('[Resume] Portfolio auto-populated from parsed resume data', pendingParseData);
      pendingParseData = null;
    }
  }

  function displayParseResultsModal(parsedData) {
    pendingParseData = parsedData;
    const profile = parsedData.profile || {};
    const stats = parsedData.stats || [];
    const skills = parsedData.skills || [];
    const projects = parsedData.projects || [];

    // Profile section
    document.getElementById('parse-name').textContent = profile.name || '—';
    document.getElementById('parse-email').textContent = profile.email || '—';
    document.getElementById('parse-title').textContent = profile.title || '—';
    document.getElementById('parse-location').textContent = profile.location || '—';
    document.getElementById('parse-education').textContent = profile.education || '—';
    document.getElementById('parse-specialization').textContent = profile.specialization || '—';

    // Stats section
    const statsList = document.getElementById('parse-stats-list');
    statsList.innerHTML = '';
    stats.forEach(s => {
      statsList.insertAdjacentHTML('beforeend', `
        <div style="padding:0.75rem;background:var(--color-card-bg);border-radius:var(--border-radius-sm);border:1px solid var(--color-card-border);">
          <div style="font-size:1.2rem;font-weight:700;color:var(--color-primary);">${s.num}</div>
          <div style="font-size:0.75rem;color:var(--color-text-muted);margin-top:0.25rem;">${s.lbl}</div>
        </div>
      `);
    });

    // Skills section
    const skillsList = document.getElementById('parse-skills-list');
    skillsList.innerHTML = '';
    skills.forEach(s => {
      skillsList.insertAdjacentHTML('beforeend', `
        <div style="padding:0.5rem;background:var(--color-card-bg);border-radius:var(--border-radius-sm);border:1px solid var(--color-card-border);">
          <div style="font-weight:600;">${s.name}</div>
          <div style="font-size:0.75rem;color:var(--color-text-muted);margin-top:0.25rem;">
            <span style="display:inline-block;background:var(--color-primary);color:white;padding:0.2rem 0.4rem;border-radius:3px;">${s.category}</span>
            <span style="margin-left:0.5rem;">${s.level}%</span>
          </div>
        </div>
      `);
    });

    // Projects section
    const projectsList = document.getElementById('parse-projects-list');
    projectsList.innerHTML = '';
    projects.forEach(p => {
      const techs = (p.techs || []).map(t => `<span style="display:inline-block;padding:0.2rem 0.4rem;background:var(--color-primary);color:white;border-radius:3px;font-size:0.75rem;margin-right:0.5rem;margin-bottom:0.5rem;">${t}</span>`).join('');
      projectsList.insertAdjacentHTML('beforeend', `
        <div style="padding:1rem;background:var(--color-card-bg);border-radius:var(--border-radius-sm);border:1px solid var(--color-card-border);">
          <div style="font-weight:700;margin-bottom:0.5rem;">${p.title || 'Untitled'}</div>
          <div style="font-size:0.85rem;color:var(--color-text-muted);margin-bottom:0.75rem;">${p.desc || ''}</div>
          <div style="margin-bottom:0.75rem;">${techs}</div>
          <div style="font-size:0.8rem;color:var(--color-text-muted);font-style:italic;">${p.details || ''}</div>
        </div>
      `);
    });

    console.log('[Resume Modal] Showing parsed resume data', parsedData);

    // Recommendations section
    const recs = parsedData.recommendations || [];
    const recSection = document.getElementById('parse-recommendations-section');
    const recList = document.getElementById('parse-recommendations-list');
    if (recList && recSection) {
      recList.innerHTML = '';
      if (recs.length) {
        recSection.style.display = 'block';
        recs.forEach(r => {
          const priorityColor = r.priority === 'high' ? 'var(--color-accent)' : r.priority === 'medium' ? 'var(--color-primary)' : 'var(--color-text-muted)';
          recList.insertAdjacentHTML('beforeend', `
            <div style="padding:0.75rem;background:var(--color-card-bg);border-radius:var(--border-radius-sm);border:1px solid var(--color-card-border);border-left:3px solid ${priorityColor};">
              <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.25rem;">${r.icon} ${r.title}</div>
              <div style="font-size:0.8rem;color:var(--color-text-muted);">${r.desc}</div>
              <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.5px;color:${priorityColor};font-weight:700;margin-top:0.3rem;">${r.priority} priority</div>
            </div>
          `);
        });
      } else {
        recSection.style.display = 'none';
      }
    }

    parseResultModal?.showModal();
    
    // Auto-apply after 3 seconds
    setTimeout(() => {
      if (parseResultModal && !parseResultModal.open) return;
      console.log('[Resume Modal] Auto-applying parsed data...');
      applyParsedResumeData();
    }, 3000);
  }

  // Global save
  portfolioForm?.addEventListener('submit', async e => {
    e.preventDefault();
    globalSaveStatus.textContent = 'Validating...'; globalSaveStatus.className = 'form-status';

    let valid = true;
    portfolioForm.querySelectorAll('input[required],textarea[required]').forEach(inp => {
      if (!inp.value.trim()) { valid = false; inp.classList.add('input-invalid'); }
      else inp.classList.remove('input-invalid');
    });

    if (!inMemorySkills.length) { globalSaveStatus.textContent = 'Add at least one skill.'; globalSaveStatus.className = 'form-status error'; return; }
    if (inMemoryProjects.length < 3) { globalSaveStatus.textContent = 'Add at least 3 projects.'; globalSaveStatus.className = 'form-status error'; return; }
    if (!valid) { globalSaveStatus.textContent = 'Fill all required fields.'; globalSaveStatus.className = 'form-status error'; return; }

    const payload = {
      profile: {
        name:           document.getElementById('admin-profile-name').value.trim(),
        title:          document.getElementById('admin-profile-title').value.trim(),
        subtitle:       document.getElementById('admin-profile-subtitle').value.trim(),
        location:       document.getElementById('admin-profile-location').value.trim(),
        education:      document.getElementById('admin-profile-education').value.trim(),
        specialization: document.getElementById('admin-profile-specialization').value.trim(),
        email:          document.getElementById('admin-profile-email').value.trim(),
        github:         document.getElementById('admin-profile-github').value.trim(),
        linkedin:       document.getElementById('admin-profile-linkedin').value.trim(),
        twitter:        document.getElementById('admin-profile-twitter').value.trim(),
        hasResume:      portfolioData?.profile?.hasResume || false
      },
      stats: [],
      skills: inMemorySkills,
      projects: inMemoryProjects
    };

    for (let i=0;i<4;i++) {
      payload.stats.push({ num: document.getElementById(`stat-num-${i}`).value.trim(), lbl: document.getElementById(`stat-lbl-${i}`).value.trim() });
    }

    saveAllBtn.disabled = true;
    const sp = saveAllBtn.querySelector('.loader-spinner');
    if (sp) sp.style.display = 'inline-block';

    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (res.ok && result.success) {
        globalSaveStatus.textContent = result.message || 'Portfolio saved!'; globalSaveStatus.className = 'form-status success';
        portfolioData = payload;
        window.scrollTo({ top:0, behavior:'smooth' });
      } else {
        globalSaveStatus.textContent = result.error || 'Save failed.'; globalSaveStatus.className = 'form-status error';
      }
    } catch (err) {
      globalSaveStatus.textContent = 'Connection failed.'; globalSaveStatus.className = 'form-status error';
    } finally {
      saveAllBtn.disabled = false; if (sp) sp.style.display = 'none';
    }
  });

  // Initial fetch
  fetchAdminPortfolio(token, username);
}

// ---------------------------------------------------------------------------
// DYNAMIC PORTFOLIO FALLBACK DATA CONSTANTS
// ---------------------------------------------------------------------------
const DEFAULT_SERVICES = [
  {
    icon: '💻',
    title: 'Web Application Development',
    desc: 'Engineering high-fidelity single page applications with premium, responsive visual patterns and modular components.'
  },
  {
    icon: '⚙️',
    title: 'Backend Systems & APIs',
    desc: 'Designing lightweight and secure Express servers, PostgreSQL or SQLite data schemas, and custom API protection systems.'
  },
  {
    icon: '🎨',
    title: 'UI/UX Visual Strategy',
    desc: 'Creating harmonic Glassmorphism palettes, smooth backdrop-filters, custom cursor physics, and beautiful responsive timelines.'
  },
  {
    icon: '🤖',
    title: 'Automated Dialogue Agents',
    desc: 'Deploying context-aware automated help desks, response matrix processors, and interactive system chatbot assistants.'
  }
];

const DEFAULT_EXPERIENCE = [
  {
    icon: '💼',
    date: '2024 - Present',
    title: 'Lead Full-Stack Consultant',
    org: 'Aura Technology Systems',
    desc: 'Led development on real-time messaging infrastructures and telemetry dashboard integrations. Programmed optimized node clusters and secure schema interfaces.'
  },
  {
    icon: '⚙️',
    date: '2023 - 2024',
    title: 'Systems Engineering Associate',
    org: 'Zenith Data Ventures',
    desc: 'Coordinated automated unit testing, deployment pipelines, and responsive vector graphing modules. Implemented multi-tenant session models.'
  },
  {
    icon: '🎓',
    date: '2020 - 2023',
    title: 'Systems & Computing Science Graduate',
    org: 'Academic Institution',
    desc: 'Mastered software engineering structures, database indexing, cryptography foundations, and responsive CSS grid architectures.'
  }
];

const DEFAULT_CERTIFICATIONS = [
  {
    icon: '🏆',
    title: 'Node.js Application Security Certificate',
    issuer: 'Security & OpenJS Coalition',
    date: '2025',
    link: 'https://openjsf.org'
  },
  {
    icon: '📐',
    title: 'Advanced UI Design & OKLCH Theme Architecture',
    issuer: 'World Design Consortium',
    date: '2024',
    link: 'https://w3.org'
  },
  {
    icon: '🔌',
    title: 'Real-time WebSocket & Node Cluster Architect',
    issuer: 'Systems Engineering Guild',
    date: '2024',
    link: 'https://github.com'
  }
];

const DEFAULT_ACHIEVEMENTS = [
  {
    icon: '🥇',
    title: 'First Place Winner: Systems Hackathon',
    meta: 'National Tech Summit 2025',
    desc: 'Built a multi-threaded system diagnostic collector that queries local metrics and resolves anomalies in under 20ms.'
  },
  {
    icon: '🚀',
    title: 'Innovation Award: Automated Parser Engine',
    meta: 'Zenith Innovation Lab',
    desc: 'Created an in-memory PDF entities extractor that accurately parsed hundreds of skills in high-concurrency benchmarks.'
  },
  {
    icon: '🎓',
    title: 'Academic Honors & Performance Excellence',
    meta: 'Department of Computing Science',
    desc: 'Awarded highest grades in Software Architecture, Database Systems, Web Security, and Design Systems.'
  }
];

const DEFAULT_TESTIMONIALS = [
  {
    quote: "AuraPort completely revolutionized our portfolio showcases! The integration of a responsive layout, custom particle physics, and an interactive resume modal is absolutely stunning and impressed all our recruiters.",
    name: "Dr. Eleanor Vance",
    title: "Director of Systems Research, Zenith Corp",
    avatar: "E"
  },
  {
    quote: "Working with this developer was a game-changer. They built our high-fidelity real-time workspace with absolute precision, zero-dependency canvas animations, and outstanding security validations. 10/10 recommendation!",
    name: "Marcus Brodie",
    title: "Senior Product Architect, Synapse Lab",
    avatar: "M"
  },
  {
    quote: "A remarkably robust academic and practical skill set! Their resume preview print layouts and chatbot assistants are extremely intuitive, responsive, and brilliantly styled.",
    name: "Prof. Alistair Finch",
    title: "Faculty Dean, Computer Engineering",
    avatar: "A"
  }
];

// ---------------------------------------------------------------------------
// TESTIMONIALS SLIDER CONTROLLER
// ---------------------------------------------------------------------------
function initTestimonialSlider() {
  const carousel = document.getElementById('testimonials-carousel');
  const dotsContainer = document.getElementById('carousel-dots');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  if (!carousel || !dotsContainer) return;

  const slides = carousel.querySelectorAll('.testimonial-slide');
  const dots = dotsContainer.querySelectorAll('.carousel-dot');
  if (!slides.length) return;

  let currentIndex = 0;
  let autoplayTimer = null;

  function showSlide(index) {
    if (index < 0) {
      currentIndex = slides.length - 1;
    } else if (index >= slides.length) {
      currentIndex = 0;
    } else {
      currentIndex = index;
    }

    slides.forEach((slide, idx) => {
      slide.classList.toggle('active', idx === currentIndex);
    });

    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentIndex);
    });
  }

  function startAutoplay() {
    stopAutoplay();
    autoplayTimer = setInterval(() => {
      showSlide(currentIndex + 1);
    }, 8000);
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  prevBtn?.addEventListener('click', () => {
    stopAutoplay();
    showSlide(currentIndex - 1);
    startAutoplay();
  });

  nextBtn?.addEventListener('click', () => {
    stopAutoplay();
    showSlide(currentIndex + 1);
    startAutoplay();
  });

  dotsContainer.addEventListener('click', (e) => {
    const dot = e.target.closest('.carousel-dot');
    if (!dot) return;
    const index = parseInt(dot.getAttribute('data-slide'));
    if (!isNaN(index)) {
      stopAutoplay();
      showSlide(index);
      startAutoplay();
    }
  });

  showSlide(0);
  startAutoplay();
}

// ---------------------------------------------------------------------------
// RESUME PREVIEW MODAL CONTROLLER
// ---------------------------------------------------------------------------
function openResumeModal(profile, skills, experience, education) {
  const modal = document.getElementById('resume-modal');
  const content = document.getElementById('resume-mockup-content');
  if (!modal || !content) return;
  education = education || [];

  const groupedSkills = {
    frontend: [],
    backend: [],
    systems: []
  };
  skills.forEach(s => {
    if (groupedSkills[s.category]) {
      groupedSkills[s.category].push(s);
    } else {
      groupedSkills.systems.push(s);
    }
  });

  const frontendStr = groupedSkills.frontend.map(s => `${s.name} (${s.level}%)`).join(', ');
  const backendStr = groupedSkills.backend.map(s => `${s.name} (${s.level}%)`).join(', ');
  const systemsStr = groupedSkills.systems.map(s => `${s.name} (${s.level}%)`).join(', ');

  const expListHtml = experience.map(exp => `
    <div class="resume-entry">
      <div class="resume-entry-header">
        <span>${exp.title}</span>
        <span>${exp.date}</span>
      </div>
      <div class="resume-entry-sub">
        <span>${exp.org}</span>
        <span>${exp.icon || '💼'}</span>
      </div>
      <p style="font-size:0.85rem;color:#333;margin-top:0.25rem;">${exp.desc}</p>
    </div>
  `).join('');

  const eduHtml = education.map(e => `
    <div class="resume-entry" style="margin-bottom:0.75rem;">
      <div class="resume-entry-header">
        <span>${e.degree || 'Degree'}</span>
        <span>${e.date || ''}</span>
      </div>
      <div class="resume-entry-sub">
        <span>${e.school || ''}</span>
      </div>
    </div>
  `).join('') || `
    <div class="resume-entry" style="margin-bottom:0;">
      <div class="resume-entry-header">
        <span>${profile.education || 'B.S. in Computer Science'}</span>
      </div>
      <div class="resume-entry-sub">
        <span>Specialization: ${profile.specialization || 'Full-Stack Engineering'}</span>
      </div>
    </div>
  `;

  content.innerHTML = `
    <div class="resume-header-mockup">
      <h1>${profile.name || 'Developer Name'}</h1>
      <p style="font-size:1.1rem;color:#555;font-weight:600;margin-bottom:0.75rem;">${profile.title || 'Software Engineering Professional'}</p>
      <div class="resume-contact-row">
        <span>📍 ${profile.location || 'N/A'}</span>
        <span>✉️ <a href="mailto:${profile.email}" style="color:inherit;text-decoration:underline;">${profile.email || 'N/A'}</a></span>
        ${profile.github ? `<span>🐙 <a href="${profile.github}" target="_blank" style="color:inherit;text-decoration:underline;">GitHub</a></span>` : ''}
        ${profile.linkedin ? `<span>🔗 <a href="${profile.linkedin}" target="_blank" style="color:inherit;text-decoration:underline;">LinkedIn</a></span>` : ''}
      </div>
    </div>

    <div class="resume-section-mockup">
      <h2>Professional Summary</h2>
      <p style="font-size:0.85rem;color:#333;line-height:1.6;">${profile.subtitle || ''}</p>
    </div>

    <div class="resume-section-mockup">
      <h2>Technical Expertise</h2>
      <div class="resume-skills-block" style="display:flex;flex-direction:column;gap:0.4rem;">
        <div><strong>Frontend & Interface:</strong> ${frontendStr || 'HTML5, CSS3, ES6+, Responsive Design'}</div>
        <div><strong>Backend & Database:</strong> ${backendStr || 'Node.js, Express.js, REST APIs'}</div>
        <div><strong>Systems & Tooling:</strong> ${systemsStr || 'Git, GitHub workflows'}</div>
      </div>
    </div>

    <div class="resume-section-mockup">
      <h2>Professional Work Experience</h2>
      ${expListHtml}
    </div>

    <div class="resume-section-mockup" style="margin-bottom:0;">
      <h2>Education</h2>
      ${eduHtml}
    </div>
  `;

  modal.showModal();
}

function initResumeModal() {
  const modal = document.getElementById('resume-modal');
  const closeBtn = document.getElementById('close-resume-modal-btn');
  const downloadBtn = document.getElementById('resume-download-btn');
  if (!modal) return;

  closeBtn?.addEventListener('click', () => modal.close());

  downloadBtn?.addEventListener('click', () => {
    window.print();
  });

  if (!('closedBy' in HTMLDialogElement.prototype)) {
    modal.addEventListener('click', (e) => {
      const r = modal.getBoundingClientRect();
      const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
      if (!inside) modal.close();
    });
  }
}

// ---------------------------------------------------------------------------
// INTERFACE SETTINGS CUSTOMIZER panel
// ---------------------------------------------------------------------------
function initCustomizer() {
  const toggle = document.getElementById('customizer-toggle');
  const panel = document.getElementById('customizer-panel');
  const close = document.getElementById('customizer-close');
  if (!toggle || !panel) return;

  // Toggle panel visibility
  toggle.addEventListener('click', () => {
    const active = panel.classList.toggle('active');
    toggle.setAttribute('aria-expanded', active);
    panel.setAttribute('aria-hidden', !active);
  });

  close?.addEventListener('click', () => {
    panel.classList.remove('active');
    toggle.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
  });

  // Theme accent selection
  const dots = document.querySelectorAll('.accent-dot');
  const savedAccent = localStorage.getItem('aura-accent') || 'purple';

  // Apply initially saved accent
  document.documentElement.classList.remove('theme-purple', 'theme-teal', 'theme-coral', 'theme-emerald');
  document.documentElement.classList.add(`theme-${savedAccent}`);
  dots.forEach(d => {
    d.classList.toggle('active', d.getAttribute('data-accent') === savedAccent);
  });

  // Handle live clicks
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const accent = dot.getAttribute('data-accent');
      dots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');

      document.documentElement.classList.remove('theme-purple', 'theme-teal', 'theme-coral', 'theme-emerald');
      document.documentElement.classList.add(`theme-${accent}`);
      localStorage.setItem('aura-accent', accent);
    });
  });

  // Wire up Scroll indicator & back to top
  window.addEventListener('scroll', () => {
    const scrollProgress = document.getElementById('scroll-progress');
    if (scrollProgress) {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const pct = (window.scrollY / totalHeight) * 100;
        scrollProgress.style.width = `${pct}%`;
      }
    }

    const backToTop = document.getElementById('back-to-top');
    if (backToTop) {
      backToTop.classList.toggle('active', window.scrollY > 300);
    }
  }, { passive: true });

  document.getElementById('back-to-top')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ---------------------------------------------------------------------------
// AURABOT AI ASSISTANT CHATBOT
// ---------------------------------------------------------------------------
function initAuraBot() {
  const toggle = document.getElementById('chatbot-toggle');
  const windowEl = document.getElementById('chatbot-window');
  const close = document.getElementById('chatbot-close');
  const messagesContainer = document.getElementById('chatbot-messages');
  const input = document.getElementById('chatbot-input');
  const sendBtn = document.getElementById('chatbot-send-btn');
  if (!toggle || !windowEl || !messagesContainer || !input) return;

  toggle.addEventListener('click', () => {
    const active = windowEl.classList.toggle('active');
    toggle.setAttribute('aria-expanded', active);
    windowEl.setAttribute('aria-hidden', !active);
    if (active) {
      input.focus();
    }
  });

  close?.addEventListener('click', () => {
    windowEl.classList.remove('active');
    toggle.setAttribute('aria-expanded', 'false');
    windowEl.setAttribute('aria-hidden', 'true');
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getBotResponse(message) {
    const m = message.toLowerCase().trim();
    if (m.includes('skill') || m.includes('stack') || m.includes('technologies') || m.includes('languages') || m.includes('program')) {
      return `I specialize in high-end responsive architectures:<br>• <strong>Frontend UI/UX:</strong> HTML5 (semantic/a11y), CSS3 Grid & Flexbox, Custom OKLCH Themes, Vanilla ES6+ JS.<br>• <strong>Backend Servers:</strong> Node.js, Express.js REST APIs, Security Rate-Limiters & Sanitization.<br>• <strong>Systems & Cloud:</strong> Git, GitHub Collaboration, Custom Telemetry Monitors.`;
    }
    if (m.includes('project') || m.includes('work') || m.includes('showcase') || m.includes('portfolio')) {
      return `I have engineered 3 state-of-the-art applications:<br>1. <strong>Synapse Collaboration Cloud:</strong> Real-time workspace synchronized via WebSockets.<br>2. <strong>Zenith Finance Analytics:</strong> Dynamic financial graph interface using high-density SVG.<br>3. <strong>Vapor System Monitor:</strong> High-performance multi-threaded Node.js cluster logger.`;
    }
    if (m.includes('education') || m.includes('study') || m.includes('university') || m.includes('college') || m.includes('degree')) {
      return `I graduated with a <strong>Bachelor of Science in Computer Science</strong>, focusing heavily on <strong>Full-Stack Software Engineering</strong>. My academic coursework covered interactive layouts, robust security middleware, and performant data structures.`;
    }
    if (m.includes('experience') || m.includes('jobs') || m.includes('career') || m.includes('employment') || m.includes('timeline')) {
      return `My career history is detailed on my experience timeline:<br>• <strong>Lead Full-Stack Consultant</strong> at Aura Technology Systems (Present)<br>• <strong>Systems Engineering Associate</strong> at Zenith Data Ventures (2023 - 2024)<br>• <strong>Computer Engineering Graduate</strong> (2020 - 2023)`;
    }
    if (m.includes('contact') || m.includes('email') || m.includes('hire') || m.includes('reach') || m.includes('phone') || m.includes('touch')) {
      return `Let's construct something premium! You can email me at <a href="mailto:admin@example.com" class="btn-text">admin@example.com</a> or drop a message in the <strong>Get In Touch</strong> form at the bottom of the page!`;
    }
    if (m.includes('cert') || m.includes('certificate') || m.includes('accreditation')) {
      return `My verifiable credentials include:<br>• <strong>Node.js Application Security Architect</strong> (OpenJS & Security Coalition)<br>• <strong>Advanced UI Design & OKLCH Layouts</strong> (World Design Consortium)<br>• <strong>Real-time Node Cluster Architect</strong> (Systems Engineering Guild)`;
    }
    if (m.includes('hi') || m.includes('hello') || m.includes('hey') || m.includes('greet') || m.includes('welcome')) {
      return `Hello! Delighted to meet you. I am AuraBot, your intelligent AI developer guide. Feel free to ask me about my <strong>skills</strong>, <strong>projects</strong>, <strong>education</strong>, or how we can get in <strong>contact</strong>!`;
    }
    return `I am here to guide you! Try asking me one of these questions:<br>• "What are your <strong>skills</strong>?"<br>• "Tell me about your <strong>projects</strong>."<br>• "What is your <strong>education</strong>?"<br>• "How do I <strong>contact</strong> you?"`;
  }

  function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    // Append user message
    const userMsg = document.createElement('div');
    userMsg.className = 'msg message-user';
    userMsg.textContent = text;
    messagesContainer.appendChild(userMsg);
    input.value = '';
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Show bot typing indicator
    const typingBubble = document.createElement('div');
    typingBubble.className = 'msg message-bot';
    typingBubble.style.fontStyle = 'italic';
    typingBubble.style.opacity = '0.7';
    typingBubble.textContent = 'AuraBot is thinking...';
    messagesContainer.appendChild(typingBubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Answer response after a slight recruiter-friendly simulated delay
    setTimeout(() => {
      typingBubble.remove();
      const botMsg = document.createElement('div');
      botMsg.className = 'msg message-bot';
      botMsg.innerHTML = getBotResponse(text);
      messagesContainer.appendChild(botMsg);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 600);
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
}

// ---------------------------------------------------------------------------
// CANVASC PARTICLES BACKGROUND ANIMATION LOOP
// ---------------------------------------------------------------------------
function initCanvasParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let particles = [];
  const numParticles = 40;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  for (let i = 0; i < numParticles; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 1.5 + 1
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const colorPrimary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#a855f7';

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = colorPrimary;
      ctx.globalAlpha = 0.35;
      ctx.fill();
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 110) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = colorPrimary;
          ctx.globalAlpha = (1.0 - (dist / 110)) * 0.15;
          ctx.lineWidth = 0.75;
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1.0;
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

// ---------------------------------------------------------------------------
// TYPEWRITER ENGINE FOR HERO ROLES
// ---------------------------------------------------------------------------
let typewriterTimeout = null;
function initTypewriter(roles = ["Full-Stack Web Architect", "AI Systems Specialist", "Premium UI Developer"]) {
  const element = document.getElementById('typewriter-role');
  if (!element) return;
  
  if (typewriterTimeout) clearTimeout(typewriterTimeout);
  
  let roleIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  
  const type = () => {
    const currentRole = roles[roleIndex];
    if (isDeleting) {
      element.textContent = currentRole.substring(0, charIndex - 1);
      charIndex--;
    } else {
      element.textContent = currentRole.substring(0, charIndex + 1);
      charIndex++;
    }
    
    let typeSpeed = isDeleting ? 40 : 80;
    
    if (!isDeleting && charIndex === currentRole.length) {
      typeSpeed = 2200; // Pause at end of role
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      roleIndex = (roleIndex + 1) % roles.length;
      typeSpeed = 500; // Pause before typing next role
    }
    
    typewriterTimeout = setTimeout(type, typeSpeed);
  };
  
  type();
}

// ---------------------------------------------------------------------------
// MAGNETIC TRAILING CURSOR PHYSICS
// ---------------------------------------------------------------------------
function initMagneticCursor() {
  const dot = document.querySelector('[data-cursor-dot]');
  const outline = document.querySelector('[data-cursor-outline]');
  if (!dot || !outline) return;

  let mouseX = 0;
  let mouseY = 0;
  let outlineX = 0;
  let outlineY = 0;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = `${mouseX}px`;
    dot.style.top = `${mouseY}px`;
  }, { passive: true });

  const animateOutline = () => {
    const lerpFactor = 0.15;
    outlineX += (mouseX - outlineX) * lerpFactor;
    outlineY += (mouseY - outlineY) * lerpFactor;

    outline.style.left = `${outlineX}px`;
    outline.style.top = `${outlineY}px`;

    requestAnimationFrame(animateOutline);
  };

  requestAnimationFrame(animateOutline);
  
  // Attach hover reactions to interactive elements
  const updateInteractives = () => {
    const interactives = document.querySelectorAll('a, button, input, textarea, select, [role="button"], .theme-toggle-btn, .carousel-dot, .open-modal-btn');
    interactives.forEach(el => {
      if (el.dataset.hasCursorListener) return;
      el.dataset.hasCursorListener = 'true';
      
      el.addEventListener('mouseenter', () => {
        outline.style.transform = 'translate(-50%, -50%) scale(1.5)';
        outline.style.borderColor = 'var(--color-primary)';
        outline.style.backgroundColor = 'oklch(from var(--color-primary) l c h / 0.1)';
      });
      el.addEventListener('mouseleave', () => {
        outline.style.transform = 'translate(-50%, -50%) scale(1)';
        outline.style.borderColor = 'var(--color-primary)';
        outline.style.backgroundColor = 'oklch(from var(--color-primary) l c h / 0.03)';
      });
    });
  };
  
  updateInteractives();
  const obs = new MutationObserver(updateInteractives);
  obs.observe(document.body, { childList: true, subtree: true });
}


