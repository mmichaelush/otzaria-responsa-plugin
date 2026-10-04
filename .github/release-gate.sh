#!/usr/bin/env bash
# שער הפרסום (release-gate.yml). הגרסה שב-release-gate.json תלויה ב-PR-ים
# של אוצריא; היא מתפרסמת רק כשכולם מוזגו ויצאו בגרסה רשמית של אוצריא (לא
# Pre-release, ולא נמוכה מ-minAppVersion) — לפני כן משתמשים לא יכלו להתקין
# אותה. עד אז הסקריפט רק מדווח מה חסר.
#
# כשהכול מוכן: תג v<version> על ראש הענף, main מתקדם אליו (fast-forward
# בלבד), ו-ci.yml רץ על התג — בנייה, Release וחנות.
#
#   GH_TOKEN, GITHUB_REPOSITORY  כמו ב-Actions
#   DRY_RUN=1                    בודק ומדווח, בלי תג ובלי פרסום
#   CONFIG=<path>                ברירת מחדל: .github/release-gate.json
set -euo pipefail

config=${CONFIG:-.github/release-gate.json}
summary=${GITHUB_STEP_SUMMARY:-/dev/stdout}
say() { printf '%s\n' "$*" >> "$summary"; }
uri() { jq -rn --arg value "$1" '$value | @uri'; }

version=$(jq -r '.version // empty' "$config")
if [ -z "$version" ]; then
  say "אין גרסה ממתינה ב-$config."
  exit 0
fi
branch=$(jq -r .branch "$config")
upstream=$(jq -r .otzaria "$config")
tag="v$version"
say "### שער הפרסום: $tag"
say

if gh api "repos/$GITHUB_REPOSITORY/git/ref/tags/$tag" --silent 2>/dev/null; then
  if gh release view "$tag" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
    say "$tag כבר פורסם. את release-gate.json מעדכנים לגרסה הבאה, או מרוקנים את version."
  else
    # התג נוצר אבל הבנייה נכשלה או עדיין רצה: לא יוצרים אותו שוב.
    say "התג $tag קיים, אבל אין לו Release. בודקים את ריצת CI על התג."
  fi
  exit 0
fi

sha=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/$branch" --jq .object.sha)
manifest=$(gh api "repos/$GITHUB_REPOSITORY/contents/plugin/manifest.json?ref=$sha" --jq .content | base64 -d)
have=$(jq -r .version <<<"$manifest")
min=$(jq -r .minAppVersion <<<"$manifest")
if [ "$have" != "$version" ]; then
  echo "::error::המניפסט ב-$branch בגרסה $have, ולא $version כמו ב-$config"
  exit 1
fi
say "- ענף: \`$branch\` (${sha:0:7}), minAppVersion $min"

merges=()
pending=0
for pr in $(jq -r '.pulls[]' "$config"); do
  IFS=$'\t' read -r merged commit title < <(
    gh api "repos/$upstream/pulls/$pr" --jq '[.merged, (.merge_commit_sha // ""), .title] | @tsv'
  )
  link="[#$pr](https://github.com/$upstream/pull/$pr)"
  if [ "$merged" = true ]; then
    say "- ✅ $link מוזג: $title"
    merges+=("$commit")
  else
    say "- ⏳ $link עוד לא מוזג: $title"
    pending=1
  fi
done
if [ "$pending" = 1 ]; then
  say
  say "ממתין למיזוג."
  exit 0
fi

# הגרסה הרשמית החדשה ביותר של אוצריא שכוללת את כל המיזוגים. התגים בצורה
# 0.9.97+789; ה-API מחזיר מהחדש לישן.
released=""
while read -r candidate; do
  [ -n "$candidate" ] || continue
  number=${candidate#v}
  number=${number%%+*}
  [ "$(printf '%s\n' "$min" "$number" | sort -V | head -n1)" = "$min" ] || continue
  contains=1
  for commit in "${merges[@]}"; do
    status=$(gh api "repos/$upstream/compare/$commit...$(uri "$candidate")" --jq .status 2>/dev/null || echo missing)
    case "$status" in
      ahead | identical) ;;
      *) contains=0; break ;;
    esac
  done
  if [ "$contains" = 1 ]; then
    released=$candidate
    break
  fi
done < <(gh api "repos/$upstream/releases?per_page=30" --jq '.[] | select((.draft or .prerelease) | not) | .tag_name')

if [ -z "$released" ]; then
  say
  say "ממתין לגרסה רשמית של אוצריא ($min ומעלה, לא Pre-release) שכוללת את כל ה-PR-ים."
  exit 0
fi
say "- ✅ אוצריא [$released](https://github.com/$upstream/releases/tag/$(uri "$released")) כוללת אותם"

if [ "${DRY_RUN:-}" = 1 ]; then
  say
  say "DRY_RUN: לא נוצר תג."
  exit 0
fi

gh api "repos/$GITHUB_REPOSITORY/git/refs" -f ref="refs/tags/$tag" -f sha="$sha" --silent
say "- 🏷️ נוצר התג $tag"
# לא בכוח: main שהתפצל מהענף ממוזג ידנית, והפרסום ממשיך בכל מקרה.
if gh api -X PATCH "repos/$GITHUB_REPOSITORY/git/refs/heads/main" -f sha="$sha" -F force=false --silent 2>/dev/null; then
  say "- main קודם ל-$branch"
else
  echo "::warning::main לא קודם ל-$branch (לא fast-forward). ממזגים ידנית."
  say "- ⚠️ main לא קודם (לא fast-forward); ממזגים ידנית"
fi
gh workflow run ci.yml --repo "$GITHUB_REPOSITORY" --ref "$tag"
say "- ▶️ הבנייה, ה-Release והפרסום בחנות רצים ב-CI על $tag"
