import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface VerificationCodeProps {
  code: string;
}

export function VerificationCode({ code }: VerificationCodeProps) {
  return (
    <Html>
      <Head />
      <Preview>您的验证码是 {code}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Heading style={heading}>验证码</Heading>
            <Text style={text}>您的验证码是：</Text>
            <Section style={codeContainer}>
              <Text style={codeText}>{code}</Text>
            </Section>
            <Text style={footer}>
              此验证码 5 分钟内有效，请勿泄露给他人。
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const section = {
  padding: '0 48px',
};

const heading = {
  fontSize: '32px',
  lineHeight: '1.3',
  fontWeight: '700',
  color: '#484848',
  textAlign: 'center' as const,
};

const text = {
  margin: '0 0 10px 0',
  fontSize: '16px',
  lineHeight: '24px',
  color: '#525252',
  textAlign: 'center' as const,
};

const codeContainer = {
  background: '#f4f4f4',
  borderRadius: '8px',
  margin: '24px 0',
  padding: '24px',
  textAlign: 'center' as const,
};

const codeText = {
  fontSize: '36px',
  fontWeight: '700',
  letterSpacing: '8px',
  color: '#000000',
  margin: '0',
  textAlign: 'center' as const,
};

const footer = {
  color: '#8898aa',
  fontSize: '14px',
  lineHeight: '24px',
  textAlign: 'center' as const,
  marginTop: '24px',
};
