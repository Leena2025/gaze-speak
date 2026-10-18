Put your music files in this folder (MP3 is best; M4A, OGG, WAV and FLAC
also work in most browsers). Sub-folders are fine.

Then, in the project folder, run:

    npm run music:index

This creates library.json here with the title, artist, album and length of
every song (read from the MP3 tags, or from file names like
"Artist - Title.mp3"). Open Music in the app and press "Check again", or
reload the page.

To fix a title or artist by hand, edit library.json; running the command
again keeps your edits. Use `npm run music:index -- --fresh` to rebuild
everything from the tags.
