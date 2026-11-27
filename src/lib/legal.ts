/**
 * The privacy policy and the terms of use, in English and Turkish.
 * DRAFT: the operator's name and the contact address are still to be filled in (OPERATOR, CONTACT),
 * and Deniz has not approved the wording yet.
 */
export const OPERATOR = '[name of the person or company that runs Doneva]';
export const CONTACT = '[contact email]';
export const UPDATED = '27.11.2026';

export type LegalDoc = { title: string; intro: string; sections: { heading: string; body: string[] }[] };

export const PRIVACY: Record<'en' | 'tr', LegalDoc> = {
  en: {
    title: 'Privacy policy',
    intro: `This page explains which personal data Doneva keeps, why, and what you can do about it. Doneva is run by ${OPERATOR}. Last updated: ${UPDATED}.`,
    sections: [
      {
        heading: 'What we keep',
        body: [
          'Account details you give us: name and surname, email address, username, company, position, and if you add them your department and phone number.',
          'What you write and share in Doneva: messages, tasks, notes, questions, solutions, schedule items, training links and files.',
          'Which companies, projects, groups and teams you are in, your connections with other people, and people you have blocked or reported.',
          'Technical records needed to run the service safely, such as sign-in times and error logs.',
          'We do not sell your data, show advertising, or track you across other apps and websites.',
        ],
      },
      {
        heading: 'Why we keep it',
        body: [
          'To let you sign in and to show your name and job to the people you work with.',
          'To deliver your messages and shared work to the people who are allowed to see them.',
          'To send you emails you need, such as a confirmation code or a password reset code.',
          'To keep the service secure and to stop misuse.',
        ],
      },
      {
        heading: 'Who can see it',
        body: [
          'People in the same project, group or team see what is shared there. Private messages are seen only by the two people in the chat.',
          'Administrators of your company space and projects can manage people and content in those spaces.',
          'We use these service providers, who process data on our behalf: Supabase (database, sign-in and file storage, in Frankfurt, Germany), Netlify (website hosting) and Resend (sending emails).',
          'We give data to authorities only when the law requires it.',
        ],
      },
      {
        heading: 'Security',
        body: [
          'Data is encrypted while it travels between your device and the servers and while it is stored. Database rules allow each person to read only what they have been given access to.',
        ],
      },
      {
        heading: 'How long we keep it',
        body: [
          'We keep your data while your account exists. You can delete your account at any time in Settings, under Security and password. Your sign-in and personal details are then erased. Things you wrote in shared projects stay for your team, shown as written by a deleted user.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'You can see and correct your details in Profile. You can ask us for a copy of your data, for correction or deletion, or object to how it is used, under the Turkish Personal Data Protection Law (KVKK) and, where it applies, the EU General Data Protection Regulation (GDPR).',
          `To use these rights or to ask a question, write to ${CONTACT}.`,
        ],
      },
      { heading: 'Children', body: ['Doneva is a tool for work and is not meant for anyone under 16.'] },
      {
        heading: 'Changes',
        body: ['If this policy changes in an important way, we will tell you in the app before the change takes effect.'],
      },
    ],
  },
  tr: {
    title: 'Gizlilik politikası',
    intro: `Bu sayfa Doneva'nın hangi kişisel verileri neden sakladığını ve sizin neler yapabileceğinizi açıklar. Doneva'yı işleten: ${OPERATOR}. Son güncelleme: ${UPDATED}.`,
    sections: [
      {
        heading: 'Neleri saklıyoruz',
        body: [
          'Bize verdiğiniz hesap bilgileri: ad ve soyad, e-posta adresi, kullanıcı adı, şirket, pozisyon ve eklediyseniz departman ile telefon numarası.',
          "Doneva'da yazdıklarınız ve paylaştıklarınız: mesajlar, görevler, notlar, sorular, çözümler, takvim kayıtları, eğitim bağlantıları ve dosyalar.",
          'Hangi şirket, proje, grup ve ekiplerde olduğunuz, diğer kişilerle bağlantılarınız ve engellediğiniz ya da şikâyet ettiğiniz kişiler.',
          'Hizmeti güvenli biçimde çalıştırmak için gereken teknik kayıtlar; örneğin giriş zamanları ve hata kayıtları.',
          'Verilerinizi satmıyoruz, reklam göstermiyoruz ve sizi başka uygulama ve sitelerde izlemiyoruz.',
        ],
      },
      {
        heading: 'Neden saklıyoruz',
        body: [
          'Giriş yapabilmeniz ve birlikte çalıştığınız kişilere adınızın ve görevinizin gösterilmesi için.',
          'Mesajlarınızın ve paylaşılan işlerin, görmeye yetkisi olan kişilere ulaştırılması için.',
          'Onay kodu ya da şifre yenileme kodu gibi gerekli e-postaların gönderilmesi için.',
          'Hizmetin güvenliğini sağlamak ve kötüye kullanımı önlemek için.',
        ],
      },
      {
        heading: 'Kimler görebilir',
        body: [
          'Aynı proje, grup ya da ekipteki kişiler orada paylaşılanları görür. Özel mesajları yalnızca sohbetteki iki kişi görür.',
          'Şirket alanınızın ve projelerinizin yöneticileri bu alanlardaki kişileri ve içeriği yönetebilir.',
          'Verileri bizim adımıza işleyen şu hizmet sağlayıcıları kullanıyoruz: Supabase (veritabanı, giriş ve dosya saklama; Frankfurt, Almanya), Netlify (web sitesi barındırma) ve Resend (e-posta gönderimi).',
          'Verileri yetkili makamlara yalnızca yasa gerektirdiğinde veririz.',
        ],
      },
      {
        heading: 'Güvenlik',
        body: [
          'Veriler cihazınız ile sunucular arasında taşınırken ve saklanırken şifrelenir. Veritabanı kuralları herkesin yalnızca kendisine erişim verilen içeriği okumasına izin verir.',
        ],
      },
      {
        heading: 'Ne kadar süre saklıyoruz',
        body: [
          'Verilerinizi hesabınız var olduğu sürece saklarız. Hesabınızı istediğiniz zaman Ayarlar içindeki Güvenlik ve şifre bölümünden silebilirsiniz. Giriş bilgileriniz ve kişisel bilgileriniz silinir. Ortak projelerde yazdıklarınız ekibiniz için kalır ve silinmiş bir kullanıcı tarafından yazılmış olarak gösterilir.',
        ],
      },
      {
        heading: 'Haklarınız',
        body: [
          'Bilgilerinizi Profil sayfasında görebilir ve düzeltebilirsiniz. 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve geçerli olduğu durumlarda AB Genel Veri Koruma Tüzüğü (GDPR) kapsamında verilerinizin bir kopyasını, düzeltilmesini ya da silinmesini isteyebilir, kullanımına itiraz edebilirsiniz.',
          `Bu haklarınızı kullanmak ya da soru sormak için ${CONTACT} adresine yazın.`,
        ],
      },
      { heading: 'Çocuklar', body: ['Doneva bir iş aracıdır ve 16 yaşından küçükler için değildir.'] },
      {
        heading: 'Değişiklikler',
        body: ['Bu politika önemli biçimde değişirse, değişiklik yürürlüğe girmeden önce uygulamada size bildiririz.'],
      },
    ],
  },
};

export const TERMS: Record<'en' | 'tr', LegalDoc> = {
  en: {
    title: 'Terms of use',
    intro: `These are the rules for using Doneva, which is run by ${OPERATOR}. By creating an account you accept them. Last updated: ${UPDATED}.`,
    sections: [
      {
        heading: 'Your account',
        body: [
          'Give correct information when you sign up, keep your password to yourself, and tell us if you think someone else is using your account. You must be at least 16.',
        ],
      },
      {
        heading: 'What you share',
        body: [
          'What you write and upload stays yours. You allow us to store it and show it to the people who have access, so that the service can work.',
          'You are responsible for what you share. Only share things you have the right to share.',
        ],
      },
      {
        heading: 'What is not allowed',
        body: [
          'Harassment, threats, hate speech, sexual or violent content, spam, or anything illegal.',
          "Sharing other people's private information without their permission.",
          'Trying to get into accounts or data that are not yours, or disturbing the service.',
          'You can block and report a person from a private chat. We look at reports and may remove content or close accounts that break these rules.',
        ],
      },
      {
        heading: 'Company spaces',
        body: [
          'The administrators of a company space or project decide who is in it and can edit or remove what is shared there.',
        ],
      },
      {
        heading: 'The service',
        body: [
          'We work to keep Doneva available and safe, but it is provided as it is, without a promise that it will never be interrupted or free of errors. Keep your own copies of anything important.',
          'As far as the law allows, we are not liable for indirect losses that come from using the service.',
        ],
      },
      {
        heading: 'Ending',
        body: [
          'You can stop using Doneva and delete your account at any time in Settings. We may suspend or close an account that breaks these terms.',
        ],
      },
      {
        heading: 'Changes and contact',
        body: [
          'If these terms change in an important way, we will tell you in the app first.',
          `Questions: ${CONTACT}. These terms are governed by the laws of the Republic of Türkiye.`,
        ],
      },
    ],
  },
  tr: {
    title: 'Kullanım koşulları',
    intro: `${OPERATOR} tarafından işletilen Doneva'yı kullanma kuralları bunlardır. Hesap oluşturarak bunları kabul etmiş olursunuz. Son güncelleme: ${UPDATED}.`,
    sections: [
      {
        heading: 'Hesabınız',
        body: [
          'Kayıt olurken doğru bilgi verin, şifrenizi kimseyle paylaşmayın ve hesabınızı başkasının kullandığını düşünüyorsanız bize bildirin. En az 16 yaşında olmalısınız.',
        ],
      },
      {
        heading: 'Paylaştıklarınız',
        body: [
          'Yazdıklarınız ve yüklediğiniz dosyalar sizindir. Hizmetin çalışabilmesi için bunları saklamamıza ve erişimi olan kişilere göstermemize izin verirsiniz.',
          'Paylaştıklarınızdan siz sorumlusunuz. Yalnızca paylaşma hakkınız olan şeyleri paylaşın.',
        ],
      },
      {
        heading: 'İzin verilmeyenler',
        body: [
          'Taciz, tehdit, nefret söylemi, cinsel ya da şiddet içeren içerik, istenmeyen toplu mesaj ve yasa dışı her şey.',
          'Başkalarının özel bilgilerini izinleri olmadan paylaşmak.',
          'Size ait olmayan hesaplara ya da verilere girmeye çalışmak veya hizmeti aksatmak.',
          'Bir kişiyi özel sohbetten engelleyebilir ve şikâyet edebilirsiniz. Şikâyetleri inceleriz; bu kurallara uymayan içeriği kaldırabilir, hesapları kapatabiliriz.',
        ],
      },
      {
        heading: 'Şirket alanları',
        body: [
          'Bir şirket alanının ya da projenin yöneticileri orada kimlerin olacağına karar verir ve orada paylaşılanları düzenleyebilir ya da kaldırabilir.',
        ],
      },
      {
        heading: 'Hizmet',
        body: [
          "Doneva'yı erişilebilir ve güvenli tutmak için çalışıyoruz; ancak hizmet olduğu gibi sunulur, hiç kesilmeyeceği ya da hatasız olacağı garanti edilmez. Önemli şeylerin kendi kopyalarını saklayın.",
          'Yasanın izin verdiği ölçüde, hizmetin kullanımından doğan dolaylı zararlardan sorumlu değiliz.',
        ],
      },
      {
        heading: 'Sona erme',
        body: [
          "Doneva'yı kullanmayı istediğiniz zaman bırakabilir ve hesabınızı Ayarlar'dan silebilirsiniz. Bu koşullara uymayan bir hesabı askıya alabilir ya da kapatabiliriz.",
        ],
      },
      {
        heading: 'Değişiklikler ve iletişim',
        body: [
          'Bu koşullar önemli biçimde değişirse önce uygulamada size bildiririz.',
          `Sorularınız için: ${CONTACT}. Bu koşullar Türkiye Cumhuriyeti yasalarına tabidir.`,
        ],
      },
    ],
  },
};
