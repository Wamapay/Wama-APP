# Validators

Centralized request validation using [zod](https://www.npmjs.com/package/zod).

Pattern (introduced starting Backend Stage 2):

```js
// validators/auth.validator.js
const { z } = require("zod");

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(2),
  }),
});

module.exports = { registerSchema };
```

```js
// middleware/validate.js
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!result.success) {
    return next(ApiError.validation("Validation failed", result.error.flatten()));
  }
  next();
};
```

The frontend's own validation is a UX convenience only — the backend
never trusts it and always re-validates every request.
