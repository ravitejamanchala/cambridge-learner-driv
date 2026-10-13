"""Publish the validated v1.1 static build without switching the source checkout.

Uses existing Git/gh authentication. Never writes credentials or rewrites main.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
REPOSITORY = 'ravitejamanchala/cambridge-learner-driv'

def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)

def output(args, **kwargs):
    return run(args, capture_output=True, text=True, **kwargs).stdout.strip()

if output(['git', 'branch', '--show-current']) != 'v1.1':
    raise SystemExit('Publish from the v1.1 source branch.')
if output(['git', 'status', '--porcelain']):
    raise SystemExit('Review and commit source changes before publishing.')

run(['npm', 'test'])
run(['npm', 'run', 'build'])
source_commit = output(['git', 'rev-parse', 'HEAD'])
release = json.loads((ROOT / 'dist/release.json').read_text())
if release['sourceCommit'] != source_commit or release['sourceDirty']:
    raise SystemExit('Build provenance does not match the clean source commit.')

remote = output(['git', 'ls-remote', 'origin', 'refs/heads/gh-pages'])
parent = None
if remote:
    run(['git', 'fetch', 'origin', 'refs/heads/gh-pages'])
    parent = output(['git', 'rev-parse', 'FETCH_HEAD'])

git_dir = output(['git', 'rev-parse', '--absolute-git-dir'])
with tempfile.TemporaryDirectory(prefix='driving-pages-') as temp:
    publish_env = os.environ.copy()
    publish_env['GIT_INDEX_FILE'] = str(Path(temp) / 'index')
    base = ['git', '--git-dir=' + git_dir, '--work-tree=' + str(ROOT / 'dist')]
    run(base + ['add', '--all', '--force'], env=publish_env)
    tree = output(base + ['write-tree'], env=publish_env)
    args = ['git', 'commit-tree', tree]
    if parent:
        args += ['-p', parent]
    commit = output(args, input='Deploy v1.1 from ' + source_commit + '\n')
    run(['git', 'update-ref', 'refs/heads/gh-pages', commit])
    run(['git', 'push', 'origin', 'refs/heads/gh-pages'])
    # The source branch is also published so this release is reproducible.
    run(['git', 'push', 'origin', 'HEAD:refs/heads/v1.1'])
    endpoint = f'repos/{REPOSITORY}/pages'
    probe = subprocess.run(['gh', 'api', endpoint], cwd=ROOT, capture_output=True, text=True)
    if probe.returncode:
        try:
            missing = json.loads(probe.stdout).get('status') == '404'
        except json.JSONDecodeError:
            missing = False
        if not missing:
            raise SystemExit('Assets were pushed, but Pages settings access failed: ' + probe.stderr.strip())
        method = 'POST'
    else:
        site = json.loads(probe.stdout)
        if site.get('source') == {'branch': 'gh-pages', 'path': '/'} and site.get('build_type') == 'legacy':
            print('Pages already uses gh-pages / (root). Wait for its build, then verify release.json.')
            raise SystemExit(0)
        method = 'PUT'
    payload = Path(temp) / 'pages.json'
    payload.write_text(json.dumps({'build_type': 'legacy', 'source': {'branch': 'gh-pages', 'path': '/'}}))
    try:
        run(['gh', 'api', '--method', method, endpoint, '--input', str(payload)])
    except subprocess.CalledProcessError:
        raise SystemExit('Assets are on gh-pages. Enable repository Settings → Pages → Deploy from a branch → gh-pages / (root).')
    print('Pages configuration saved. Wait for the GitHub Pages build and verify release.json before calling the site live.')
