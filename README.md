# tuckyes.com

My profile. It works like an old social media profile, except I own it. Everything on it comes from the markdown files in `content/`. Push a change and GitHub builds the site and publishes it in a minute or two. It also rebuilds every morning on its own to pick up new Letterboxd films and INTERSECT releases.

## Posting something

Copy `content/posts/_template.md`, rename the copy with the date first (like `2026-11-05-lino-print.md`), and write:

```markdown
---
date: 2026-11-05
mood: inky
---
Pulled the first print off the new block. Messy, but I like it.

![[first print.jpg]]
```

`date` can stay empty if the file name starts with the date. Commit and push. The newest posts show on your profile, and all of them are on the Posts page. Your newest post also sets "Last login" ("Online now!" if it's from the last two days), and its `mood:` becomes your mood.

**Photos:** put them in `content/media/` and embed them with `![[file name.jpg]]`. In Obsidian, just paste or drag the photo into the note.

**Ignored files:** anything starting with `_` is skipped, files and folders alike. That's why each folder's `_template.md` never shows up, and it's a handy place for drafts: `content/posts/_drafts/`.

## Your cookbook

One note per recipe, the same way it works in Obsidian:

```
content/cookbook/
  Better Pesto.md
  Mains/
    Crispy Gochujang Chicken.md
  Soups/
    Kimchi Ramen with Instant Pot Chashu.md
```

- **The file name is the title.** A `# Heading` at the top that matches it is fine too.
- **Subfolders are categories.** They're optional. Recipes without one go under "Everything else."
- **Each recipe gets its own page,** and the Cookbook page lists them all, grouped by category. The box on your profile lists every recipe while there are 15 or fewer, then switches to showing categories with counts.
- **Extras are optional:** `serves:`, `time:` and `photo:` at the top. See `content/cookbook/_template.md`.
- **To bring in your existing cookbook,** copy the recipe notes in and move any photos they use into `content/media/`.

## Everything else

| File | What it is |
| --- | --- |
| `content/site.md` | Name, headline, location, default mood, the Details table, your Spotify playlist, the page background, and your email, GitHub and Letterboxd usernames. |
| `content/intro.md` | "About me." |
| `content/meet.md` | "Who I'd like to meet." Leave it empty to drop that part. |
| `content/interests.md` | Interests. Each line is `- **Label**: text`. Your latest Letterboxd films get added to the Movies row on their own. |
| `content/friends.md` | Your Top 8. One friend per line: `- Name \| link \| photo`. The box stays hidden until you add someone. The first 8 show on the profile; with more than 8, a "View all" link goes to a page with everyone. "Add to Friends" emails you, so you decide who goes here. |
| `content/made/*.md` | Stuff I've Made. `order` sets the order. Add `github: owner/repo` and the site shows the latest release and download count automatically. Images go in `images:`, one per line, as `path \| caption`. Add `hidden: true` to take something off the page without deleting it (the M8 tracker and Carbine Camera are hidden that way right now). |
| `content/comments/*.md` | Comments. People send them with the "Add Comment" button, which opens an email, and you paste the ones you want to post into a copy of `_template.md` here. |
| `assets/images/` | Photos from the old site. |

**Customizing the look:** in `site.md`, change `background_color` and `background_dots`, or set `background_image` to a file in `content/media` (a scan of one of your prints would look great tiled) and it repeats behind the page.

## Writing from Obsidian

1. Clone this repo to your computer, then in Obsidian choose **Open folder as vault** and pick the repo folder.
2. **Settings → Files and links**
   - Default location for new notes: `content/posts`
   - Default location for new attachments: In the folder specified below, then `content/media`
3. **Making a new post or recipe:** right-click the folder's `_template.md` and choose **Make a copy**, then rename it.
4. **Settings → Community plugins**: install **Git**. Either run "Commit and sync" when you're done writing, or turn on auto commit-and-sync every few minutes.
5. **On your phone:** install Obsidian and the same Git plugin, and clone the repo using a GitHub personal access token with read and write access to this repo. It's slower than on a computer, but this vault is small.

## First-time setup

1. **Make the repo.** Create a new public repo on GitHub (for example `tucktuckg00se/tuckyes`), then push these files:
   ```sh
   cd tuckyes
   git init -b main
   git add .
   git commit -m "First version"
   git remote add origin git@github.com:tucktuckg00se/tuckyes.git
   git push -u origin main
   ```
2. **Save the photos before touching DNS.** Run `./get-old-images.sh`, then commit and push. It copies the photos the site uses from the old Mobirise site. Once tuckyes.com points at GitHub, those old copies are gone.
3. **Turn on Pages.** Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow runs on your next push, or start it from the **Actions** tab. Before the domain is set up, the site lives at `tucktuckg00se.github.io/tuckyes/`.
4. **Verify the domain (recommended).** Your GitHub profile **Settings → Pages → Add a domain**, enter `tuckyes.com`, and add the TXT record it gives you. This stops anyone else from claiming the domain on GitHub.
5. **Add the domain to the repo.** Repo **Settings → Pages → Custom domain**: `tuckyes.com`, then Save. No CNAME file is needed, because the Actions workflow publishes the site.
6. **Point DNS at GitHub.** Wherever tuckyes.com's DNS is managed, remove the old records for `@` and `www` and add these:

   | Type | Name | Value |
   | --- | --- | --- |
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |
   | AAAA | @ | 2606:50c0:8000::153 |
   | AAAA | @ | 2606:50c0:8001::153 |
   | AAAA | @ | 2606:50c0:8002::153 |
   | AAAA | @ | 2606:50c0:8003::153 |
   | CNAME | www | tucktuckg00se.github.io |

7. **Turn on HTTPS.** Once DNS has caught up (up to a day), tick **Enforce HTTPS** on the Pages settings screen.

## Previewing on your computer

```sh
npm install
npm run preview            # builds, then serves it at http://localhost:8000
npm run build -- --offline # builds without Letterboxd or GitHub
```

## Good to know

- If Letterboxd or GitHub is down during a build, the site just builds without that part.
- GitHub pauses scheduled workflows in public repos after 60 days without a commit. Posting a note keeps the daily rebuild going. If it pauses, re-enable it from the **Actions** tab.
- `build.mjs` turns the notes into the site, and `template/` holds the page layout and styles. You shouldn't need to touch either to post updates.

## Photos

Drop photos into `content/media` at any size. The build never changes your files: it puts web-sized copies (1600px max) on the site and makes small square thumbnails for friend tiles, project thumbnails and your portrait. Clicking a thumbnail still opens the full photo.
