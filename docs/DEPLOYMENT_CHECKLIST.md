# LexRadar v2.0 · Deployment Checklist

Complete pre-deployment verification for production release.

---

## ✅ Pre-Flight Checklist

### Assets & Files
- [x] CSS files compiled (style.css = 1273 lines)
- [x] CSS responsive breakpoints tested (320px → 2560px)
- [x] JavaScript security.js added (316 lines)
- [x] robots.txt created
- [x] sitemap.xml created
- [x] _headers configured (security + cache)
- [x] index.html updated with SEO meta + JSON-LD

### SEO & Indexing
- [ ] Meta tags validated: title, description, canonical
- [ ] Open Graph tags filled (og:title, og:description, og:image)
- [ ] JSON-LD Schema validates at https://schema.org/validator
- [ ] robots.txt accessible at `/robots.txt`
- [ ] sitemap.xml accessible at `/sitemap.xml`
- [ ] Google Search Console: sitemap submitted
- [ ] Bing Webmaster Tools: sitemap submitted

### Security Headers
- [ ] CSP header validates in DevTools
- [ ] X-Frame-Options: DENY set
- [ ] X-Content-Type-Options: nosniff set
- [ ] HSTS header active (if HTTPS enabled)
- [ ] Permissions-Policy configured
- [ ] Test at https://securityheaders.com (target: A+)

### Mobile & Responsive
- [ ] Test 320px width (iPhone SE in DevTools)
- [ ] Test 640px width (Galaxy A10)
- [ ] Test 1024px width (iPad)
- [ ] Test 1280px+ (Desktop)
- [ ] No horizontal scrolling on any viewport
- [ ] All buttons/inputs ≥48px touch targets
- [ ] Fonts scale smoothly (clamp() functions working)

### Accessibility
- [ ] Run Lighthouse accessibility audit (target: 90+)
- [ ] Keyboard navigation: Tab through all elements
- [ ] Modal focus trap: Tab/Shift+Tab cycles within dialog
- [ ] Escape key closes modals
- [ ] ARIA labels present on form inputs
- [ ] Color contrast ratio ≥4.5:1 (check light mode especially)
- [ ] VoiceOver/NVDA test: headings read, buttons labeled

### Performance
- [ ] Lighthouse Performance: ≥90
- [ ] Core Web Vitals: LCP <2.5s, FID <100ms, CLS <0.1
- [ ] Minify CSS before deploy (if not auto-minified)
- [ ] Minify JS before deploy
- [ ] Gzip compression enabled on server
- [ ] CSS file size <50KB (gzipped)
- [ ] No render-blocking resources

### Browser Compatibility
- [ ] Chrome/Chromium: Latest 2 versions
- [ ] Firefox: Latest 2 versions
- [ ] Safari: Latest 2 versions
- [ ] Edge: Latest 2 versions
- [ ] Mobile Safari (iOS): Latest
- [ ] Chrome Android: Latest

### Functionality Testing
- [ ] Login works (test macarriazo, jlpinter)
- [ ] Search functionality: CENDOJ, TJUE, both
- [ ] Results display correctly
- [ ] Favorites feature works
- [ ] History tracking works
- [ ] Export JSON/CSV works
- [ ] Theme toggle (dark/light) works
- [ ] Detail dialog opens/closes

### Security Testing
- [ ] XSS prevention: attempt `<img src=x onerror=alert()>`
- [ ] Rate limiter working (5 searches/minute test)
- [ ] HTTPS enforced (no mixed content warnings)
- [ ] CORS allowed only for whitelisted domains
- [ ] localStorage encrypted (verify not plain text)
- [ ] No console errors related to CSP
- [ ] API calls to worker.dev secure

### SEO Tools
- [ ] Google Search Console: coverage report
- [ ] Bing Webmaster Tools: index status
- [ ] Screaming Frog crawl: no errors, all URLs crawlable
- [ ] Yoast/SEMrush: readability score
- [ ] Facebook Share Debugger: OG tags render correctly
- [ ] Twitter Card Validator: card displays correctly

---

## 🚀 Deployment Steps

### GitHub Pages (Recommended for static SPA)

1. **Verify files committed**:
   ```bash
   git status
   git add -A
   git commit -m "LexRadar v2.0: responsive design, SEO, security"
   ```

2. **Push to main**:
   ```bash
   git push origin main
   ```

3. **Verify deployment**: 
   - GitHub Actions run automatically
   - Check Settings → Pages → Build and deployment
   - Site published at https://github.com/username/lexradar.es

### Cloudflare (Recommended for security headers)

1. **Add Cloudflare nameservers** to domain registrar
2. **Verify DNS**: Wait for propagation (typically 24h)
3. **Enable HTTPS**: Cloudflare → SSL/TLS → Flexible/Full
4. **Configure cache**: Rules → Cache Rules (set by Cache-Control)
5. **Verify _headers**: `_headers` file auto-applied by Cloudflare

### Custom Server (Node/Express)

```javascript
// server.js
const express = require('express');
const app = express();

// Security headers middleware
app.use((req, res, next) => {
  res.set('X-Frame-Options', 'DENY');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'");
  next();
});

// Serve static files
app.use(express.static('public'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(3000);
```

---

## 🔍 Post-Deployment Verification

### Day 1 After Launch
- [ ] Site loads without errors (check DevTools Console)
- [ ] Mobile responsive (test on real phones)
- [ ] Search functionality works
- [ ] No 404 errors (check Server Logs)
- [ ] CSS/JS loaded (Network tab in DevTools)
- [ ] CSP working (no violations in Console)

### Week 1
- [ ] Google Search Console: coverage report
- [ ] Core Web Vitals: stable metrics
- [ ] Error tracking (if configured): zero critical errors
- [ ] User feedback: no major complaints
- [ ] Analytics: traffic flow as expected

### Month 1
- [ ] Google ranking: main keywords indexed
- [ ] Bing/Google: indexed 100+ pages
- [ ] Core Web Vitals: all green (LCP, FID, CLS)
- [ ] Security scan: no vulnerabilities detected
- [ ] Uptime: 99.9%+

---

## 📊 Rollback Plan

If critical issues post-deployment:

1. **Revert code** (Git):
   ```bash
   git revert HEAD~1
   git push origin main
   ```

2. **Invalidate cache** (Cloudflare):
   - Go to Caching → Purge Cache → Purge Everything
   - Wait 5 minutes for new code to serve

3. **Monitor logs** for errors after rollback

4. **Notify users** (if applicable):
   - In-app toast message
   - Twitter/blog post
   - Email notification

---

## 📞 Support & Escalation

### Issues During Deployment
- **Build fails**: Check GitHub Actions logs
- **Site won't load**: Verify `index.html` path in settings
- **CSS not loading**: Check `_headers` cache rules
- **CSP blocking content**: Review CSP violations in Console

### Post-Launch Support
- **Bugs reported**: Create GitHub issue with replication steps
- **Security issues**: Follow SECURITY.md incident response
- **Performance degradation**: Run Lighthouse audit
- **User complaints**: Prioritize mobile vs desktop issues

---

## 🎯 Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Lighthouse Score | 90+ | [Run after deploy] |
| Mobile Usability | 100% | [Check DevTools] |
| LCP (Load) | <2.5s | [Measure] |
| FID (Interaction) | <100ms | [Measure] |
| CLS (Visual) | <0.1 | [Measure] |
| Security Headers | A+ | [See securityheaders.com] |
| Accessibility | WCAG 2.1 AA | [Run audit] |
| Browser Support | Latest 2 versions | ✅ Tested |

---

## 📝 Sign-Off

- [ ] Project Manager: Approved for production
- [ ] Frontend Lead: Code reviewed and tested
- [ ] Security: Security checklist passed
- [ ] QA: Functionality verified on all browsers
- [ ] DevOps: Deployment infrastructure ready

**Date**: ________________  
**Version**: 2.0  
**Release Manager**: _______________  

---

**Document Status**: ✅ Ready for Production Release
