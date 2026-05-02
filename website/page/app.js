// App shell — mounted into #root. Built once; no runtime JSX transform in production.

const TWEAKS = {
  theme: 'dark',
  anim: 'on',
  density: 'normal'
};
function App() {
  const [cfg, setCfg] = React.useState(TWEAKS);
  const theme = cfg.theme === 'light' ? AF.light : AF.dark;
  React.useEffect(() => {
    document.body.classList.toggle('af-anim', cfg.anim === 'on');
    document.body.classList.remove('af-density-compact', 'af-density-cozy');
    if (cfg.density !== 'normal') document.body.classList.add('af-density-' + cfg.density);
    document.body.style.background = theme.bg;
    document.documentElement.style.colorScheme = cfg.theme === 'light' ? 'light' : 'dark';
  }, [cfg, theme]);

  // scroll reveal
  React.useEffect(() => {
    const all = () => document.querySelectorAll('[data-af-reveal]');
    if (cfg.anim === 'off') {
      all().forEach(el => el.classList.add('af-in'));
      return;
    }
    requestAnimationFrame(() => {
      const vh = window.innerHeight;
      all().forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < vh) el.classList.add('af-in');
      });
      const io = new IntersectionObserver(es => {
        es.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('af-in');
            io.unobserve(e.target);
          }
        });
      }, {
        threshold: .08,
        rootMargin: '0px 0px -40px 0px'
      });
      all().forEach(el => {
        if (!el.classList.contains('af-in')) io.observe(el);
      });
    });
  }, [cfg.anim]);

  // edit-mode protocol (no-op outside design tool / parent frame)
  React.useEffect(() => {
    const onMsg = e => {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') document.getElementById('tweaks').classList.add('open');
      if (d.type === '__deactivate_edit_mode') document.getElementById('tweaks').classList.remove('open');
    };
    window.addEventListener('message', onMsg);
    try {
      window.parent.postMessage({
        type: '__edit_mode_available'
      }, '*');
    } catch {}
    document.querySelectorAll('#tweaks .row').forEach(row => {
      const g = row.dataset.g;
      row.querySelectorAll('button').forEach(b => {
        b.onclick = () => {
          row.querySelectorAll('button').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          // Functional setState — effect runs once with empty deps, so `cfg`
          // from the outer closure is stale after any prior tweak change.
          setCfg(prev => ({
            ...prev,
            [g]: b.dataset.v
          }));
          try {
            window.parent.postMessage({
              type: '__edit_mode_set_keys',
              edits: {
                [g]: b.dataset.v
              }
            }, '*');
          } catch {}
        };
      });
    });
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: theme.bg,
      color: theme.ink,
      minHeight: '100vh',
      fontFamily: '"JetBrains Mono",monospace'
    }
  }, /*#__PURE__*/React.createElement(Hero, {
    theme: theme
  }), /*#__PURE__*/React.createElement(SkillsGrid, {
    theme: theme
  }), /*#__PURE__*/React.createElement(BeforeAfter, {
    theme: theme
  }), /*#__PURE__*/React.createElement(SDDPipeline, {
    theme: theme
  }), /*#__PURE__*/React.createElement(DayInLife, {
    theme: theme
  }), /*#__PURE__*/React.createElement(Wiki, {
    theme: theme
  }), /*#__PURE__*/React.createElement(SessionLearning, {
    theme: theme
  }), /*#__PURE__*/React.createElement(Evaluating, {
    theme: theme
  }), /*#__PURE__*/React.createElement(Platforms, {
    theme: theme
  }), /*#__PURE__*/React.createElement(Hooks, {
    theme: theme
  }), /*#__PURE__*/React.createElement(Install, {
    theme: theme
  }), /*#__PURE__*/React.createElement(Footer, {
    theme: theme
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));