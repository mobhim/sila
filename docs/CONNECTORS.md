# كتابة موصّل لنظام فندق حقيقي

صلة لا تعرف شيئاً عن نظام الفندق الشريك. كل ما تعرفه هو **الموصّل**: كائن واحد بعشر دوال. الوكيل وأدواته ومحرّك المزامنة تستخدم هذه الدوال فقط، فاستبدال الشريك التجريبي بنظام حقيقي معناه كتابة كائن جديد بنفس الشكل، دون تغيير في الوكيل.

> هذا الملف يصف الواجهة التي تتوقعها صلة. لا يصف واجهة أي نظام فندقي بعينه، ولا يفترضها. قبل كتابة موصّل لنظام محدد نحتاج مواصفاته الرسمية من مزوّده (انظر [ما نحتاجه منك](#ما-نحتاجه-منك)).

## أين يقع الموصّل

```
الوكيل (agent/)  ──►  الأدوات (app.js)  ──►  محرّك المزامنة (connectors/sync.js)  ──►  الموصّل  ──►  نظام الفندق
                                                        ▲                                  │
                                                        └──────── أحداث التغيير ◄──────────┘
```

- العقد: [`connectors/connector.js`](../connectors/connector.js)
- المثال العامل: [`connectors/demo-partner.js`](../connectors/demo-partner.js) (شريك تجريبي داخل المتصفح)
- محرّك المزامنة: [`connectors/sync.js`](../connectors/sync.js) (الطابور، السجل، حل التعارض). لا يتغير مع تغيّر الموصّل.

## الواجهة

### القراءة: الشريك هو المرجع

| الدالة | تعيد | ملاحظات |
|---|---|---|
| `status()` | `{ online }` | هل الشريك متاح الآن. دالة فورية، لا تنتظر الشبكة |
| `revision()` | قيمة تتغير كلما تغيّرت بيانات الشريك | عدّاد، أو ETag، أو طابع زمني. تُستخدم لتجنّب قراءة لا لزوم لها |
| `getBookings()` | `Promise<[{ id, name, room, nights, eta, phone, email }]>` | `id` هو ما يعرّف به النزيل نفسه (رقم الهوية في النموذج) |
| `getRooms()` | `Promise<[{ no, cat, rate, state }]>` | `state` واحدة من `ready` و`prep` و`maint` |
| `getRates()` | `Promise<[{ cat, rate }]>` | السعر الأساسي لليلة في كل فئة. تعديل الطلب تحسبه صلة فوقه |

### الكتابة: ما ينفّذه الوكيل

كل عملية تحمل `opId` فريداً. **الشريك الذي رأى `opId` من قبل يعيد `{ ok: true, duplicate: true }` ولا ينفّذ شيئاً.** هذا ما يمنع تكرار العملية عند إعادة الإرسال.

| الدالة | العملية | متى ترفضها |
|---|---|---|
| `pushCheckIn(op)` | `{ opId, bookingId, room, at }` | `unknown_booking` |
| `pushRequest(op)` | `{ opId, bookingId, room, type: 'request', items: [{ request, dept }] }` أو `{ ..., type: 'ticket', ticket: { n, kind, text } }` | `unknown_booking` |
| `pushRoomChange(op)` | `{ opId, bookingId, from, to, fromState? }` | `conflict` إذا لم تكن غرفة الحجز عند الشريك هي `from`، أو كانت `to` مشغولة |
| `pushRoomState(op)` | `{ opId, room, from, to }` | `conflict` إذا لم تكن حالة الغرفة عند الشريك هي `from` |

كلها تعيد `Promise<{ ok, duplicate?, error?, revision? }>`. وعند انقطاع الاتصال **ترفض الوعد** بخطأ فيه `code: 'offline'`، فيبقي المحرّك العملية في الطابور ويعيد إرسالها لاحقاً.

`from` في العمليتين الأخيرتين هي القيمة التي كانت صلة تراها قبل التغيير. بها يعرف الشريك أن بياناته تحركت في غياب صلة، فيرفض، وتأخذ صلة قيمته: **الشريك مرجع عند التعارض.**

### الأحداث

```js
const stop = connector.subscribe(event => { ... });
// event: { type: 'changed' }              بيانات الشريك تغيّرت: المحرّك يقرأ من جديد
//        { type: 'link', online: bool }   الاتصال انقطع أو عاد: المحرّك يرسل ما انتظر ثم يقرأ
```

إن لم يدعم النظام إشعارات، يكفي أن يستطلع الموصّل `revision` كل بضع ثوانٍ ويطلق `changed` عند تغيّرها.

## هيكل موصّل لنظام حقيقي

يعمل على **الخادم**، لا في المتصفح: مفاتيح نظام الفندق لا تصل المتصفح أبداً.

```js
// connectors/my-hotel.js — هيكل فقط. كل ما بين الأقواس المعقوفة يأتي من مواصفات النظام الفعلية.
export function createConnector({ baseUrl, token }) {
  const subs = [], seen = new Set();
  let online = true, rev = null;
  const call = async (path, init) => {
    try {
      const r = await fetch(baseUrl + path, { ...init, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } });
      if (!online) { online = true; subs.forEach(f => f({ type: 'link', online: true })); }
      return r;
    } catch (e) {
      if (online) { online = false; subs.forEach(f => f({ type: 'link', online: false })); }
      throw Object.assign(new Error('partner offline'), { code: 'offline' });
    }
  };
  const push = async (path, op) => {
    if (seen.has(op.opId)) return { ok: true, duplicate: true };
    // الأفضل أن يُرسل opId للنظام كمفتاح منع تكرار إن كان يدعمه، ليصمد المنع بعد إعادة تشغيل الخادم
    const r = await call(path, { method: 'POST', body: JSON.stringify(/* حوّل op إلى شكل النظام */ op) });
    if (r.status === 409) return { ok: false, error: 'conflict' };
    if (!r.ok) return { ok: false, error: 'refused_' + r.status };
    seen.add(op.opId);
    return { ok: true };
  };
  return {
    status: () => ({ online }),
    revision: () => rev,
    getBookings: async () => (await (await call('/{bookings}')).json()).map(b => ({ id: b.{guestId}, name: b.{name}, room: b.{room}, nights: b.{nights}, eta: b.{eta}, phone: b.{phone}, email: b.{email} })),
    getRooms: async () => (await (await call('/{rooms}')).json()).map(r => ({ no: r.{number}, cat: r.{category}, rate: r.{baseRate}, state: /* حوّل حالة النظام إلى ready | prep | maint */ r.{state} })),
    getRates: async () => /* اشتقها من الغرف أو من نقطة الأسعار */ [],
    pushCheckIn: op => push('/{check-in}', op),
    pushRequest: op => push('/{requests}', op),
    pushRoomChange: op => push('/{room-change}', op),
    pushRoomState: op => push('/{room-state}', op),
    subscribe: f => { subs.push(f); return () => subs.splice(subs.indexOf(f), 1); }
  };
}
```

للتحقق من اكتمال أي موصّل:

```js
SILA.connectors.missing(connector)   // قائمة فارغة = جاهز للتوصيل
```

ثم يُمرَّر لمحرّك المزامنة مكان الشريك التجريبي:

```js
SILA.sync.create({ connector, key, refresh, local, makeBooking, commit })
```

## ما يضمنه محرّك المزامنة

- **الطابور:** كل عملية تُحفظ قبل إرسالها، وتُرسل بالترتيب. عند الانقطاع تنتظر، وصلة تكمل ببياناتها.
- **منع التكرار:** معرّف العملية يُرسل مع كل محاولة. الرد `duplicate` يُسجَّل «تكرار مُنع».
- **التعارض:** قبل كل قراءة يُقارَن ما عند صلة بآخر قيمة اتُّفق عليها مع الشريك. إن تحركت القيمتان في اتجاهين، تُعتمد قيمة الشريك ويُسجَّل التعارض.
- **السجل:** أُرسل، استُقبل، تعارض، تكرار مُنع، ينتظر، رُفض، مع الوقت.
- **صفحة واحدة في كل مرة:** إن كانت أكثر من صفحة لصلة مفتوحة، قفل واحد يمنع إرسال العملية مرتين.

## ما لا يغطيه النموذج الحالي

- **إنشاء حجز من صلة:** الحجز الذي يُنشأ في صلة يبقى محلياً. إرساله يحتاج دالة جديدة في الواجهة ومواصفات إنشاء الحجز في النظام.
- **الدفع، الأقفال، الرسائل:** أنظمة أخرى بموصّلاتها، وليست جزءاً من هذه الواجهة.
- **المصادقة وتدوير المفاتيح وحدود المعدل:** تختلف من نظام لآخر، وتُبنى داخل الموصّل.
- **سجل التدقيق الدائم:** السجل هنا في المتصفح ومحدود بآخر 80 سطراً.

## ما نحتاجه منك

لكتابة موصّل لنظام بعينه، لا نخمّن واجهته. نحتاج:

1. اسم النظام وإصداره، ووثائق واجهته البرمجية الرسمية.
2. بيئة تجربة (sandbox) ومفاتيحها.
3. كيف يعرّف النظام النزيل والحجز والغرفة، وما حالات الغرف عنده.
4. هل يدعم إشعارات التغيير (webhooks)، ومفتاح منع التكرار، والتحديث المشروط.
5. ما المسموح كتابته من طرف خارجي: تسجيل الوصول، الطلبات، نقل الغرفة، حالة الغرفة.
