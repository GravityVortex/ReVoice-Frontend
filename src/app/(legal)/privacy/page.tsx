import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | SoulDub.ai',
  description: 'Privacy policy for SoulDub.ai.',
};

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-foreground mb-2 text-3xl font-bold">Privacy Policy</h1>
      <p className="text-muted-foreground">
        <strong>Last updated: January 24, 2026</strong>
      </p>

      <h2>Introduction</h2>
      <p>
        This Privacy Policy explains how <strong>SoulDub.ai</strong> (&quot;
        <strong>we</strong>,&quot; &quot;<strong>us</strong>,&quot; or &quot;
        <strong>our</strong>&quot;) collects, uses, and shares information when
        you use <strong>https://www.souldub.ai</strong> and any related services
        (collectively, the &quot;<strong>Services</strong>&quot;).
      </p>
      <p>If you do not agree with this Privacy Policy, please do not use the Services.</p>

      <h2>Information We Collect</h2>
      <p>We collect information in the following ways:</p>

      <h3>Information you provide</h3>
      <ul>
        <li>
          <strong>Account information:</strong> such as email address, name, and
          authentication details you provide when you create an account or
          contact support.
        </li>
        <li>
          <strong>User content:</strong> such as audio, video, text, and other
          files you upload to the Services (&quot;<strong>User Content</strong>
          &quot;), plus any inputs you provide to generate outputs.
        </li>
        <li>
          <strong>Support communications:</strong> such as messages you send us,
          including any attachments.
        </li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li>
          <strong>Usage data:</strong> such as pages viewed, actions taken, time
          spent, and referring/exit pages.
        </li>
        <li>
          <strong>Device and log data:</strong> such as IP address, browser
          type, operating system, device identifiers, and timestamps.
        </li>
        <li>
          <strong>Cookies and similar technologies:</strong> used to enable core
          functionality, remember preferences, and help us understand how the
          Services are used.
        </li>
      </ul>

      <h3>Payment information</h3>
      <p>
        If you make purchases, payments are processed by third-party payment
        processors (for example, <strong>Stripe</strong>). We receive limited
        information about transactions (such as status and plan) but do not
        receive or store full payment card details directly.
      </p>

      <h2>How We Use Information</h2>
      <p>We use information we collect to:</p>
      <ul>
        <li>Provide, operate, and maintain the Services.</li>
        <li>Process uploads and generate outputs requested by you.</li>
        <li>Authenticate users and secure accounts.</li>
        <li>Process payments and manage subscriptions.</li>
        <li>Improve the Services, including troubleshooting, analytics, and performance.</li>
        <li>Communicate with you about the Services, including updates and support.</li>
        <li>Enforce our Terms and protect the safety and integrity of the Services.</li>
        <li>Comply with legal obligations.</li>
      </ul>

      <h2>How We Share Information</h2>
      <p>We may share information in the following circumstances:</p>
      <ul>
        <li>
          <strong>Service providers:</strong> with vendors who help us operate
          the Services (for example, hosting, storage, analytics, customer
          support, and payment processing). They are permitted to use
          information only to perform services for us.
        </li>
        <li>
          <strong>Legal and safety:</strong> when we believe disclosure is
          necessary to comply with applicable law, respond to lawful requests,
          protect rights and safety, investigate fraud or security issues, or
          enforce our policies.
        </li>
        <li>
          <strong>Business transfers:</strong> in connection with a merger,
          acquisition, financing, or sale of assets, where information may be
          transferred as part of the transaction.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        You can control cookies through your browser settings. Disabling cookies
        may affect the functionality of the Services.
      </p>

      <h2>Data Retention</h2>
      <p>
        We retain information for as long as necessary to provide the Services
        and for legitimate business purposes (such as complying with legal
        obligations, resolving disputes, and enforcing agreements). Retention
        periods may vary depending on the type of information and how it is
        used.
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable administrative, technical, and physical safeguards
        designed to protect information. However, no method of transmission or
        storage is completely secure, and we cannot guarantee absolute security.
      </p>

      <h2>International Transfers</h2>
      <p>
        Your information may be processed in countries other than your own.
        Where required, we take steps intended to ensure appropriate safeguards
        are in place for international transfers.
      </p>

      <h2>Children&apos;s Privacy</h2>
      <p>
        The Services are not intended for children, and we do not knowingly
        collect personal information from children.
      </p>

      <h2>Your Rights and Choices</h2>
      <p>
        Depending on where you live, you may have rights to access, correct,
        delete, or object to certain processing of your personal information. To
        exercise these rights, contact us at <strong>support@souldub.ai</strong>.
      </p>

      <h2>Changes to This Privacy Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Changes are
        effective when posted on this page with an updated &quot;Last updated&quot;
        date.
      </p>

      <h2>Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy, contact us at{' '}
        <strong>support@souldub.ai</strong>.
      </p>
    </>
  );
}

