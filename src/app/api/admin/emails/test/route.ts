import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailService } from '@/lib/email';
import { getRequestUserId } from '@/lib/request-user';


async function verifyAuth(request: Request) {
  try {
    const userId = await getRequestUserId(request);
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'ADMIN') return null;
    return user;
  } catch (_e) {
    return null;
  }
}

// POST - Send test email
export async function POST(request: Request) {
  try {
    const user = await verifyAuth(request);

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { templateId, email } = body;

    if (!templateId) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }

    // Fetch the template
    const template = await prisma.emailTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Get admin user email — user is already fetched from DB
    const recipientEmail = email || user.email;

    // Replace variables with test data
    let testSubject = template.subject;
    let testBody = template.body;

    const testVariables: Record<string, string> = {
      name: 'Alex',
      email: recipientEmail,
      code: '482193',
      amount: '$128.00',
      commission: '$25.60',
      commissionRate: '20%',
      saleAmount: '$128.00',
      tierName: 'Gold',
      previousTier: 'Standard',
      leadId: 'LD-A3K9',
      reference: 'LD-A3K9',
      referralCode: 'LAZI-ALEX',
      publicReferralLink: 'https://lazi.studio/?ref=LAZI-ALEX',
      referralLink: 'https://lazi.studio/?ref=LAZI-ALEX',
      companyName: 'LAZI STUDIO PARTNERS',
      dashboardUrl: 'https://partners.lazi.studio/affiliate',
      reason: 'Does not meet our criteria',
      partner_name: 'Alex',
      program_name: 'LAZI Partner Program',
      referral_link: 'https://lazi.studio/?ref=LAZI-ALEX',
      referral_name: 'Jane Smith',
      referral_email: 'jane@example.com',
      referral_count: '5',
      payout_method: 'PayPal',
      partner_email: user.email,
      signup_link: 'https://partners.lazi.studio/register',
      dashboard_link: 'https://partners.lazi.studio/affiliate',
    };

    // Replace all variables in subject and body
    Object.entries(testVariables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      testSubject = testSubject.replace(regex, value);
      testBody = testBody.replace(regex, value);
    });

    // Send the test email via Plunk
    try {
      await emailService.sendCustomEmail(
        recipientEmail,
        `[TEST] ${testSubject}`,
        testBody
      );
    } catch (emailError) {
      console.error('Email send failed:', emailError);
    }

    // Log the test email
    const emailLog = await prisma.emailLog.create({
      data: {
        templateId: template.id,
        recipientId: user.id,
        recipientEmail: recipientEmail,
        subject: `[TEST] ${testSubject}`,
        body: testBody,
        status: 'SENT',
        sentAt: new Date(),
        metadata: {
          isTest: true,
          sentBy: user.id,
        } as any,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${recipientEmail}`,
      emailLog,
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    return NextResponse.json(
      { error: 'Failed to send test email' },
      { status: 500 }
    );
  }
}
