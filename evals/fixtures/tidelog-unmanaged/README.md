# Tidelog

A tiny event log for deploy hooks. Each hook appends an event; `filterEvents`
reads them back.

```js
const { filterEvents } = require('./src/history');

filterEvents(events, { kind: 'deploy' });
```

An event is `{ kind, at, message }`, where `at` is an ISO-8601 timestamp.

`npm test` runs the suite.
