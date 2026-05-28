# Luach V70 - Hidden Owner Drive

This version hides the owner/default Drive folder from the UI and from frontend files.

Behavior:
- Default mode: recordings are saved through Apps Script to the backend default folder. The family does not see that Drive link.
- Custom family mode: if a family enters its own Drive folder, that folder is shown only in that board's voice settings and can be included in that board's links.
- This is UI/source cleanup, not a full authentication redesign. The backend still controls where files are saved.

Upload to GitHub root:
- index.html
- patient.html
- boindex.html
- sw.js
- manifest.json
- icons/
- assets/
- favicon.ico

Apps Script:
- Replace apps-script/Code.gs or root Code.gs
- Deploy → Manage deployments → Edit → New version → Deploy
