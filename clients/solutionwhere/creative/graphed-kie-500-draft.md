Draft for Max. Not sent.

Kie image tools are returning HTTP 500 from the Graphed tools runner.

What we called, from the Solutionwhere project, with `graphed tools run`:

- `kie:gpt-image-2-text-to-image`
- `kie:gpt-image-2-image-to-image`
- `kie:nano-banana-2`

Catalog GET works and lists those tools. Starting a run does not. The response is about 15 seconds, status 500, body:

{"code":"SERVER_ERROR","message":"An unexpected error occurred"}

No run id comes back, so there is no Kie status message to read. A text-only GPT Image 2 call fails the same way, so this is not a bad reference-image URL. Earlier the same day a handful of image-to-image runs did finish. Then every start failed. `heygen:avatars.looks` still succeeded in a window when the image tools were already 500ing, so it was not the whole tools runner.

The model is up. The same GPT Image 2 job completed on Higgsfield (job 6e4ac564-040a-4b41-9f24-a83c9420e297) with the same kind of prompt and reference images. We then generated the rest of the statics that way.

What we need from the runner: the upstream error, or a run id, instead of a bare 500.
