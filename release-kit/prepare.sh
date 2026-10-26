#!/usr/bin/env bash
# release-kit/prepare.sh: the work of the action release-kit/prepare (see prepare/action.yml).
#
# Is the commit the tip of the branch, and does the pre-release `latest` exist? It is in a script of its
# own because the action runs it twice over: with `bash` on Linux runners and with Git Bash by its full
# path on Windows runners (on a self-hosted Windows runner `shell: bash` is the WSL launcher).
#
# Environment: GH_TOKEN, SHA (a full commit id), BRANCH, GITHUB_REPOSITORY, GITHUB_OUTPUT.
set -eu

: "${GH_TOKEN:?}" "${SHA:?}" "${BRANCH:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_OUTPUT:?}"

case "$SHA" in
    *[!0-9a-f]* | "") echo "::error::sha must be a full commit id, got '$SHA'"; exit 1 ;;
esac
if [ "${#SHA}" -ne 40 ]; then
    echo "::error::sha must be a full commit id, got '$SHA'"
    exit 1
fi
short="$(printf '%s' "$SHA" | cut -c1-7)"
tip="$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/$BRANCH" --jq .object.sha)"
echo "sha=$SHA" >> "$GITHUB_OUTPUT"
echo "short=$short" >> "$GITHUB_OUTPUT"
if [ "$tip" != "$SHA" ]; then
    echo "current=false" >> "$GITHUB_OUTPUT"
    echo "::notice::$short is not the tip of $BRANCH ($tip): nothing is built for it"
    exit 0
fi
echo "current=true" >> "$GITHUB_OUTPUT"
if ! gh release view latest --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
    gh release create latest --repo "$GITHUB_REPOSITORY" --prerelease --latest=false --target "$SHA" \
        --title "Rolling build (starting)" --notes "The first rolling build is being made."
fi
