# Luach2 V77 - Post-QA Deployment Ready

This is a full deployment-ready package.

## Upload to GitHub root
Upload/replace all files and folders from this ZIP directly in the GitHub Pages repo root.

Important root files/folders:
- index.html
- patient.html
- boindex.html
- sw.js
- manifest.json
- icons/
- assets/
- backoffice/
- favicon.ico

## Apps Script
Copy `apps-script/Code.gs` into Google Apps Script, then:

Deploy → Manage deployments → Edit → New version → Deploy

A convenience copy also exists at root as `Code.gs`.

## Notes
- The old stale QA reports were removed.
- `backoffice/index.html` and the Service Worker redirect both route to `boindex.html`.
- Visible patch marker comments were removed from generated HTML/source.
- The current version keeps the stable vanilla architecture. A full modular/React refactor should be a separate project.
