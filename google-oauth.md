# Google OAuth Configuration

تم التحقق حيًا من تدفق تسجيل الدخول في CyberJocx بتاريخ 2026-08-27.

يستخدم التطبيق OAuth Client ID الذي يبدأ بـ `55880054684-2j319e9l01g42m7al032i2696mt5a5ui.apps.googleusercontent.com` داخل مشروع Google Cloud `cyberjjocx`.

خطأ `redirect_uri_mismatch` مرتبط بإعدادات OAuth Client و**Authorized redirect URIs**، وليس بحساب Google الذي يحاول تسجيل الدخول. لذلك تغيير البريد أو اختيار حساب آخر وحده لا يحل المشكلة؛ يجب تعديل العميل الذي يطابق `client_id` وإضافة الرابط الكامل داخله.

يجب أن يبقى **Authorized redirect URI** مضبوطًا على الرابط الكامل التالي:

`https://cyberjocx-mwzy3nmd.manus.space/api/auth/google/callback`

يستخدم الخادم هذا الرابط صراحةً عبر `GOOGLE_OAUTH_REDIRECT_URI`، كما يدعم `x-forwarded-host` و`x-forwarded-proto` عند غياب القيمة الصريحة. لا يجب استخدام عنوان Cloud Run الداخلي الذي ينتهي بـ `a.run.app`، ولا صيغة الرابط المختصرة التي تنتهي عند جذر النطاق.

تمت المصادقة بحساب Google، ظهرت شاشة اختيار الحساب بدل خطأ `redirect_uri_mismatch`، ثم عاد المستخدم إلى CyberJocx وظهرت صفحة `YOUR PROFILE` باسم Fares Gebril، ما يثبت إنشاء الجلسة المحلية بنجاح.
