import { resend, sendTransactionalEmail } from './plunk';
import { wrapLaziEmail, lookupTypesFor, EMAIL_WORDMARK } from './email-brand';
import { getProgramBrand } from './default-email-templates';
import { commissionPercent } from './commission-rate';
import { formatMoney } from './money';

export { resend };

export interface EmailTemplate {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

// Move private helper out of class if needed, or keep it. I'll keep it.

export interface WelcomeEmailData {
  name: string;
  email: string;
  role: 'affiliate' | 'admin';
  loginUrl: string;
  password?: string;
  referralCode?: string;
  publicReferralLink?: string;
}

export interface ReferralNotificationData {
  affiliateName: string;
  leadName: string;
  leadEmail: string;
  company?: string;
  estimatedValue?: number;
}

export interface ApprovalEmailData {
  affiliateName: string;
  referralId: string;
  leadName: string;
  commissionAmount: number;
  status: 'approved' | 'rejected';
  notes?: string;
}

export interface PayoutNotificationData {
  affiliateName: string;
  affiliateEmail: string;
  amount: number;
  method: 'bank_csv' | 'stripe_connect';
  processingDate: string;
}

export interface ConversionNotificationData {
  affiliateName: string;
  affiliateEmail: string;
  leadName: string;
  leadEmail: string;
  company?: string;
  convertedAmountCents: number;
  commissionCents: number;
}

export interface CommissionNotificationData {
  affiliateName: string;
  affiliateEmail: string;
  customerName: string;
  amountCents: number;
  commissionCents: number;
  commissionRate: number;
  transactionId: string;
}

class EmailService {
  private defaultFrom = process.env.PLUNK_FROM_EMAIL || 'hello@lazi.studio';

  /** Escape HTML special characters to prevent XSS in email templates */
  private escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async getCurrencySymbol(): Promise<string> {
    const { getCurrencySymbol } = await import('./currency');
    return await getCurrencySymbol();
  }

  private formatAmount(cents: number, symbol: string): string {
    const { formatCurrency } = require('./currency'); // Use require if import is problematic in this context, or just import at top if possible
    return formatCurrency(cents, symbol);
  }

  private async getTemplateFromDb(type: string) {
    try {
      const { prisma } = await import('./prisma');
      for (const candidate of lookupTypesFor(type)) {
        const template = await prisma.emailTemplate.findFirst({
          where: { type: candidate as any, isActive: true },
        });
        if (template) return template;
      }
      return null;
    } catch (error) {
      console.error(`Failed to fetch email template ${type}:`, error);
      return null;
    }
  }

  private replaceVariables(content: string, variables: Record<string, any>, asHtml = false): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (variables[key] === undefined || variables[key] === null) return match;
      const value = String(variables[key]);
      return asHtml ? this.escapeHtml(value) : value;
    });
  }

  private async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ success: boolean; message: string }> {
    return sendTransactionalEmail(params);
  }

  private async sendTemplatedEmail(params: {
    to: string;
    templateType: string;
    fallbackSubject: string;
    variables: Record<string, any>;
    generateFallbackHtml: () => Promise<string> | string;
  }): Promise<{ success: boolean; message: string }> {
    const brand = await getProgramBrand();
    const variables = {
      companyName: brand.companyName,
      dashboardUrl: brand.dashboardUrl,
      ...params.variables,
    };
    const dbTemplate = await this.getTemplateFromDb(params.templateType);

    let subject = this.replaceVariables(params.fallbackSubject, variables, false);
    let html = '';

    if (dbTemplate) {
      subject = this.replaceVariables(dbTemplate.subject, variables, false);
      html = this.replaceVariables(dbTemplate.body, variables, true);
    } else {
      html = await Promise.resolve(params.generateFallbackHtml());
    }

    return this.sendEmail({
      to: params.to,
      subject,
      html,
    });
  }

  private generateWelcomeEmailHTML(data: WelcomeEmailData): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Welcome to LAZI STUDIO PARTNERS</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>LAZI STUDIO PARTNERS</h1>
      </div>
      <div class="content">
        <h2>Hello ${this.escapeHtml(data.name)}!</h2>
        <p>Thank you for joining our affiliate platform as a <strong>${this.escapeHtml(data.role)}</strong>.</p>
        
        ${data.role === 'affiliate' ? `
        <p>Your partner account is ready. Share your referral link to start earning.</p>
        ${data.referralCode ? `<p><strong>Referral code:</strong> ${this.escapeHtml(data.referralCode)}</p>` : ''}
        ${data.publicReferralLink ? `<p><strong>Your link:</strong> ${this.escapeHtml(data.publicReferralLink)}</p>` : ''}
        ` : `
        <p>Your admin account has been created and is ready to use.</p>
        <p>You can now:</p>
        <ul>
          <li>Manage affiliate applications</li>
          <li>Review and approve referrals</li>
          <li>Process commission payments</li>
          <li>Access platform analytics</li>
        </ul>
        `}

        ${data.password ? `
        <div style="background: #ffffff; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; margin: 20px 0;">
          <p style="margin-top: 0; font-weight: bold; color: #64748b;">Your Initial Password:</p>
          <code style="background: #f1f5f9; padding: 10px; display: block; border-radius: 4px; font-size: 18px; text-align: center; color: #0f172a;">${this.escapeHtml(data.password)}</code>
          <p style="margin-bottom: 0; font-size: 13px; color: #94a3b8; text-align: center; margin-top: 10px;">For security, please change your password after your first login.</p>
        </div>
        ` : ''}
        
        <div style="text-align: center;">
          <a href="${data.loginUrl}" class="button">Login to Your Account</a>
        </div>
        
        <p>If you have any questions, please don't hesitate to contact our support team.</p>
        
        <p>Best regards,<br>LAZI STUDIO PARTNERS</p>
      </div>
      <div class="footer">
        <p>This email was sent to ${this.escapeHtml(data.email)}</p>
        <p>© ${new Date().getFullYear()} LAZI STUDIO PARTNERS. All rights reserved.</p>
      </div>
    </body>
    </html>
    `;
  }

  private generateReferralNotificationHTML(data: ReferralNotificationData, _symbol?: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Referral Submission</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f5576c; }
        .button { display: inline-block; background: #f5576c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>New Referral Submission 📋</h1>
      </div>
      <div class="content">
        <h2>Hello Admin!</h2>
        <p>A new referral has been submitted and requires your review.</p>
        
        <div class="details">
          <h3>Referral Details:</h3>
          <p><strong>Affiliate:</strong> ${this.escapeHtml(data.affiliateName)}</p>
          <p><strong>Lead Name:</strong> ${this.escapeHtml(data.leadName)}</p>
          <p><strong>Lead Email:</strong> ${this.escapeHtml(data.leadEmail)}</p>
          ${data.company ? `<p><strong>Company:</strong> ${this.escapeHtml(data.company)}</p>` : ''}
          ${data.estimatedValue ? `<p><strong>Estimated Value:</strong> ${formatMoney(Math.round(data.estimatedValue * 100))}</p>` : ''}
        </div>
        
        <div style="text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin" class="button">Review Referral</a>
        </div>
        
        <p>Please review this referral in the admin dashboard and approve or reject it accordingly.</p>
        
        <p>Best regards,<br>The Refferq System</p>
      </div>
    </body>
    </html>
    `;
  }

  private generateApprovalEmailHTML(data: ApprovalEmailData, _symbol?: string): string {
    const isApproved = data.status === 'approved';
    const statusColor = isApproved ? '#28a745' : '#dc3545';
    const statusText = isApproved ? 'Approved' : 'Rejected';
    const emoji = isApproved ? '✅' : '❌';

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Referral ${statusText}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${statusColor}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid ${statusColor}; }
        .button { display: inline-block; background: ${statusColor}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <p style="letter-spacing:0.22em;text-transform:uppercase;font-weight:600;margin:0 0 12px 0;">LAZI STUDIO PARTNERS</p>
        <h1>Referral ${statusText} ${emoji}</h1>
      </div>
      <div class="content">
        <h2>Hello ${this.escapeHtml(data.affiliateName)}!</h2>
        <p>Your referral submission has been <strong>${statusText.toLowerCase()}</strong>.</p>
        
        <div class="details">
          <h3>Referral Details:</h3>
          <p><strong>Lead Name:</strong> ${this.escapeHtml(data.leadName)}</p>
          <p><strong>Status:</strong> ${statusText}</p>
          ${isApproved ? `<p><strong>Commission Amount:</strong> ${formatMoney(data.commissionAmount)}</p>` : ''}
          ${data.notes ? `<p><strong>Notes:</strong> ${this.escapeHtml(data.notes)}</p>` : ''}
        </div>
        
        ${isApproved ? `
        <p>🎉 Congratulations! Your referral has been approved and the commission has been added to your account.</p>
        ` : `
        <p>Unfortunately, this referral did not meet our approval criteria. Please review the feedback and feel free to submit future referrals.</p>
        `}
        
        <div style="text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/affiliate" class="button">View Dashboard</a>
        </div>
        
        <p>Best regards,<br>LAZI STUDIO PARTNERS</p>
      </div>
    </body>
    </html>
    `;
  }

  private generatePayoutNotificationHTML(data: PayoutNotificationData, symbol: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Payout Processed</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4facfe; }
        .button { display: inline-block; background: #4facfe; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Payout Processed 💰</h1>
      </div>
      <div class="content">
        <h2>Hello ${this.escapeHtml(data.affiliateName)}!</h2>
        <p>Great news! Your commission payout has been processed.</p>
        
        <div class="details">
          <h3>Payout Details:</h3>
          <p><strong>Amount:</strong> ${this.formatAmount(data.amount, symbol)}</p>
          <p><strong>Method:</strong> ${data.method === 'stripe_connect' ? 'Stripe Connect' : 'Bank Transfer'}</p>
          <p><strong>Processing Date:</strong> ${this.escapeHtml(data.processingDate)}</p>
        </div>
        
        ${data.method === 'bank_csv' ? `
        <p>Your payout will be processed via bank transfer within 3-5 business days.</p>
        ` : `
        <p>Your payout has been sent to your connected Stripe account and should be available immediately.</p>
        `}
        
        <div style="text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/affiliate" class="button">View Dashboard</a>
        </div>
        
        <p>Thank you for being a valued affiliate partner!</p>
        
        <p>Best regards,<br>The Refferq Team</p>
      </div>
    </body>
    </html>
    `;
  }

  // New private method for Conversion Notification HTML
  private generateConversionNotificationHTML(data: ConversionNotificationData, symbol: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Referral Converted!</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981; }
        .button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🎉 Referral Converted!</h1>
      </div>
      <div class="content">
        <h2>Hello ${this.escapeHtml(data.affiliateName)}!</h2>
          <p>Great news! A sale you referred has been confirmed.</p>
        
        <div class="details">
          <h3>Conversion Details:</h3>
          <p><strong>Reference:</strong> ${this.escapeHtml((data as ConversionNotificationData & { leadId?: string }).leadId || '—')}</p>
          <p><strong>Converted Amount:</strong> ${this.formatAmount(data.convertedAmountCents, symbol)}</p>
          <p><strong>Your Commission:</strong> ${this.formatAmount(data.commissionCents, symbol)}</p>
        </div>
        
        <p>The commission for this conversion has been added to your pending earnings.</p>
        
        <div style="text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/affiliate" class="button">View Your Dashboard</a>
        </div>
        
        <p>Keep up the fantastic work!</p>
        
        <p>Best regards,<br>The Refferq Team</p>
      </div>
    </body>
    </html>
    `;
  }

  // New private method for Commission Notification HTML
  private generateCommissionNotificationHTML(data: CommissionNotificationData, symbol: string): string {
    const amount = this.formatAmount(data.amountCents, symbol);
    const commission = this.formatAmount(data.commissionCents, symbol);
    const rate = `${commissionPercent(data.commissionRate)}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Commission Earned!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
          .amount-box { background: white; border: 2px solid #10b981; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
          .commission { font-size: 36px; font-weight: bold; color: #10b981; }
          .button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>💰 New Commission Earned!</h1>
        </div>
        <div class="content">
          <h2>Great news, ${this.escapeHtml(data.affiliateName)}!</h2>
          <p>A customer you referred has made a payment, and you've earned a commission!</p>
          
          <div class="amount-box">
            <div style="font-size: 14px; color: #666; margin-bottom: 10px;">You earned</div>
            <div class="commission">${commission}</div>
            <div style="font-size: 14px; color: #666; margin-top: 10px;">${rate}% commission</div>
          </div>
          
          <div class="details">
            <h3 style="margin-top: 0;">Transaction Details</h3>
            <div class="detail-row">
              <span>Reference:</span>
              <strong>${this.escapeHtml(data.transactionId)}</strong>
            </div>
            <div class="detail-row">
              <span>Transaction Amount:</span>
              <strong>${amount}</strong>
            </div>
            <div class="detail-row">
              <span>Your Commission:</span>
              <strong style="color: #10b981;">${commission}</strong>
            </div>
            <div class="detail-row">
              <span>Commission Rate:</span>
              <strong>${rate}%</strong>
            </div>
            <div class="detail-row" style="border-bottom: none;">
              <span>Transaction ID:</span>
              <strong style="font-size: 12px;">${this.escapeHtml(data.transactionId)}</strong>
            </div>
          </div>
          
          <p>This commission is currently <strong>pending</strong> and will be included in your next payout.</p>
          
          <div style="text-align: center;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/affiliate" class="button">View Your Dashboard</a>
          </div>
          
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            Keep up the great work! Continue referring customers to earn more commissions.
          </p>
          
          <p>Best regards,<br>The Refferq Team</p>
        </div>
      </body>
      </html>
    `;
  }

  async sendPartnerInviteEmail(data: {
    name: string;
    email: string;
    inviteUrl: string;
  }): Promise<{ success: boolean; message: string }> {
    const brand = await getProgramBrand();
    const html = wrapLaziEmail({
      preheader: 'Join the LAZI partner program.',
      kicker: 'Invitation',
      heading: 'You are invited',
      intro: `Hi ${this.escapeHtml(data.name)},`,
      paragraphs: [
        `You have been invited to join the ${this.escapeHtml(brand.companyName)} partner program.`,
        'Open the link below, then we will email you a login code to finish joining.',
      ],
      ctaLabel: 'Accept invite',
      ctaUrl: data.inviteUrl,
      footer: 'If you were not expecting this, you can ignore this email.',
      wordmark: EMAIL_WORDMARK,
    });
    return this.sendEmail({
      to: data.email,
      subject: `You are invited to the ${brand.companyName} partner program`,
      html,
    });
  }

  async sendTeamInviteEmail(data: {
    name: string;
    email: string;
    inviteUrl: string;
    role: string;
  }): Promise<{ success: boolean; message: string }> {
    const brand = await getProgramBrand();
    const roleLabel = data.role.charAt(0) + data.role.slice(1).toLowerCase();
    const html = wrapLaziEmail({
      preheader: `Join the ${brand.companyName} admin team.`,
      kicker: 'Team invitation',
      heading: 'You are invited',
      intro: `Hi ${this.escapeHtml(data.name)},`,
      paragraphs: [
        `You have been invited to join the ${this.escapeHtml(brand.companyName)} admin team as ${this.escapeHtml(roleLabel)}.`,
        'Open the link below, then we will email you a login code to finish joining.',
      ],
      ctaLabel: 'Accept invite',
      ctaUrl: data.inviteUrl,
      footer: 'If you were not expecting this, you can ignore this email.',
      wordmark: EMAIL_WORDMARK,
    });
    return this.sendEmail({
      to: data.email,
      subject: `You are invited to the ${brand.companyName} admin team`,
      html,
    });
  }

  async sendWelcomeEmail(data: WelcomeEmailData): Promise<{ success: boolean; message: string }> {
    const referralCode = data.referralCode?.trim() || '';
    const publicReferralLink = data.publicReferralLink?.trim() || '';
    return this.sendTemplatedEmail({
      to: data.email,
      templateType: 'WELCOME',
      fallbackSubject: 'Welcome to the {{companyName}} partner program',
      variables: {
        name: data.name,
        email: data.email,
        referralCode,
        code: referralCode,
        publicReferralLink,
        referralLink: publicReferralLink,
      },
      generateFallbackHtml: () => this.generateWelcomeEmailHTML(data),
    });
  }

  /**
   * Send WELCOME once, only after an affiliate exists with a referral code.
   * Skips accounts older than 7 days so existing partners are not emailed on next login.
   */
  async sendWelcomeOnce(userId: string, opts?: { force?: boolean }): Promise<void> {
    const { prisma } = await import('./prisma');
    const { publicReferralLink } = await import('./referral-link');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { affiliate: true },
    });
    const affiliate = user?.affiliate;
    const referralCode = affiliate?.referralCode?.trim() || '';
    if (!user || user.role !== 'AFFILIATE' || !affiliate || !referralCode) return;
    if (affiliate.welcomeSentAt) return;

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (!opts?.force && Date.now() - user.createdAt.getTime() > sevenDaysMs) return;

    const claimed = await prisma.affiliate.updateMany({
      where: { id: affiliate.id, welcomeSentAt: null },
      data: { welcomeSentAt: new Date() },
    });
    if (claimed.count === 0) return;

    try {
      const settings = await prisma.programSettings.findFirst({
        select: { websiteUrl: true },
      });
      const link = publicReferralLink(settings?.websiteUrl, referralCode);
      const { partnerAppUrl } = await import('./app-url');
      const appUrl = partnerAppUrl();
      const result = await this.sendWelcomeEmail({
        name: user.name,
        email: user.email,
        role: 'affiliate',
        loginUrl: `${appUrl}/login`,
        referralCode,
        publicReferralLink: link,
      });
      if (!result.success) {
        await prisma.affiliate.update({
          where: { id: affiliate.id },
          data: { welcomeSentAt: null },
        });
        console.error('⚠️ Welcome email failed:', result.message);
      }
    } catch (error) {
      await prisma.affiliate.update({
        where: { id: affiliate.id },
        data: { welcomeSentAt: null },
      });
      console.error('⚠️ Welcome email failed:', error);
    }
  }

  async sendOtpEmail(to: string, name: string, code: string): Promise<{ success: boolean; message: string }> {
    const brand = await getProgramBrand();
    return this.sendTemplatedEmail({
      to,
      templateType: 'OTP',
      fallbackSubject: 'Your login code',
      variables: { name, email: to, code },
      generateFallbackHtml: () =>
        wrapLaziEmail({
          preheader: 'Your login code.',
          kicker: 'Sign in',
          heading: 'Your login code',
          intro: `Hi ${this.escapeHtml(name)},`,
          paragraphs: ['Use this code to sign in. It expires in 10 minutes.'],
          details: [{ label: 'Code', value: this.escapeHtml(code) }],
          ctaLabel: 'Sign in',
          ctaUrl: brand.loginUrl,
          footer: 'If you did not request this code, you can ignore this email.',
          wordmark: EMAIL_WORDMARK,
        }),
    });
  }

  async sendReferralNotification(data: ReferralNotificationData): Promise<{ success: boolean; message: string }> {
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || ['admin@yourdomain.com'];
    const symbol = await this.getCurrencySymbol();

    const results = await Promise.all(
      adminEmails.map(email =>
        this.sendTemplatedEmail({
          to: email.trim(),
          templateType: 'NEW_REFERRAL',
          fallbackSubject: `New Referral Submission from ${data.affiliateName}`,
          variables: { ...data, symbol },
          generateFallbackHtml: () => this.generateReferralNotificationHTML(data, symbol),
        })
      )
    );

    const success = results.every(r => r.success);
    return {
      success,
      message: success ? 'Referral notifications sent' : 'Some notifications failed'
    };
  }

  async sendApprovalEmail(affiliateEmail: string, data: ApprovalEmailData): Promise<{ success: boolean; message: string }> {
    const statusText = data.status === 'approved' ? 'Approved' : 'Rejected';
    const symbol = await this.getCurrencySymbol();
    return this.sendTemplatedEmail({
      to: affiliateEmail,
      templateType: data.status === 'approved' ? 'APPROVAL' : 'REJECTION',
      fallbackSubject: `Referral ${statusText} - ${data.leadName}`,
      variables: { ...data, statusText, symbol }, // Pass statusText and symbol for template variables
      generateFallbackHtml: () => this.generateApprovalEmailHTML(data, symbol),
    });
  }

  async sendPayoutNotification(data: PayoutNotificationData): Promise<{ success: boolean; message: string }> {
    const symbol = await this.getCurrencySymbol();
    return this.sendTemplatedEmail({
      to: data.affiliateEmail,
      templateType: 'PAYOUT_PROCESSED',
      fallbackSubject: `Payout Processed - ${this.formatAmount(data.amount, symbol)}`,
      variables: { ...data, symbol },
      generateFallbackHtml: () => this.generatePayoutNotificationHTML(data, symbol),
    });
  }

  // New method for Conversion Notification
  async sendConversionNotification(data: ConversionNotificationData): Promise<{ success: boolean; message: string }> {
    const symbol = await this.getCurrencySymbol();
    return this.sendTemplatedEmail({
      to: data.affiliateEmail,
      templateType: 'REFERRAL_CONVERTED',
      fallbackSubject: `🎉 Your Referral for ${data.leadName} Converted!`,
      variables: { ...data, symbol },
      generateFallbackHtml: () => this.generateConversionNotificationHTML(data, symbol),
    });
  }

  // New method for Commission Notification
  async sendCommissionNotification(data: CommissionNotificationData): Promise<{ success: boolean; message: string }> {
    const symbol = await this.getCurrencySymbol();
    return this.sendTemplatedEmail({
      to: data.affiliateEmail,
      templateType: 'COMMISSION_EARNED',
      fallbackSubject: `💰 New Commission: ${this.formatAmount(data.commissionCents, symbol)} Earned!`,
      variables: { ...data, symbol },
      generateFallbackHtml: () => this.generateCommissionNotificationHTML(data, symbol),
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<{ success: boolean; message: string }> {
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`;
    return this.sendTemplatedEmail({
      to: email,
      templateType: 'PASSWORD_RESET',
      fallbackSubject: 'Password Reset Request - LAZI STUDIO PARTNERS',
      variables: { resetUrl },
      generateFallbackHtml: () => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Password Reset Request</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Password Reset Request 🔐</h1>
        </div>
        <div class="content">
          <h2>Hello!</h2>
          <p>We received a request to reset your password for your affiliate platform account.</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Your Password</a>
          </div>
          
          <div class="warning">
            <strong>⚠️ Security Notice:</strong>
            <ul>
              <li>This link will expire in 1 hour</li>
              <li>If you didn't request this reset, please ignore this email</li>
              <li>Never share this link with others</li>
            </ul>
          </div>
          
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px;">${resetUrl}</p>
          
          <p>Best regards,<br>The Refferq Team</p>
        </div>
      </body>
      </html>
      `,
    });
  }

  async sendVerificationEmail(email: string, verificationToken: string): Promise<{ success: boolean; message: string }> {
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verificationToken}`;
    return this.sendTemplatedEmail({
      to: email,
      templateType: 'EMAIL_VERIFICATION',
      fallbackSubject: 'Verify Your Email Address - LAZI STUDIO PARTNERS',
      variables: { verificationUrl },
      generateFallbackHtml: () => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Verify Your Email Address</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Verify Your Email Address ✉️</h1>
        </div>
        <div class="content">
          <h2>Hello!</h2>
          <p>Thank you for registering with our affiliate platform. Please verify your email address to complete your registration.</p>
          
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>
          
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px;">${verificationUrl}</p>
          
          <p>This verification link will expire in 24 hours.</p>
          
          <p>Best regards,<br>The Refferq Team</p>
        </div>
      </body>
      </html>
      `,
    });
  }

  async sendTransactionCreatedEmail(
    affiliateEmail: string,
    data: {
      affiliateName: string;
      customerName: string;
      amountCents: number;
      commissionCents: number;
      commissionRate: number;
      transactionId: string;
    }
  ): Promise<{ success: boolean; message: string }> {
    const symbol = await this.getCurrencySymbol();
    const commission = this.formatAmount(data.commissionCents, symbol);
    const leadId = (data as { leadId?: string }).leadId || data.transactionId;
    return this.sendTemplatedEmail({
      to: affiliateEmail,
      templateType: 'COMMISSION_EARNED',
      fallbackSubject: `New commission: ${commission} earned`,
      variables: {
        name: data.affiliateName,
        email: affiliateEmail,
        amount: this.formatAmount(data.amountCents, symbol),
        commission,
        commissionRate: `${commissionPercent(data.commissionRate)}%`,
        leadId,
        reference: leadId,
        symbol,
      },
      generateFallbackHtml: () => this.generateCommissionNotificationHTML({
        ...data,
        affiliateEmail,
        customerName: leadId,
        transactionId: leadId,
      }, symbol),
    });
  }

  async sendPayoutCreatedEmail(
    affiliateEmail: string,
    data: {
      affiliateName: string;
      amountCents: number;
      commissionCount: number;
      payoutId: string;
      method?: string;
    }
  ): Promise<{ success: boolean; message: string }> {
    const symbol = await this.getCurrencySymbol();
    const amount = formatMoney(data.amountCents, symbol);
    return this.sendTemplatedEmail({
      to: affiliateEmail,
      templateType: 'PAYOUT_GENERATED',
      fallbackSubject: `Payout initiated: ${amount}`,
      variables: { ...data, amount: this.formatAmount(data.amountCents, symbol), symbol },
      generateFallbackHtml: () => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Payout Initiated</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
          .amount-box { background: white; border: 2px solid #3b82f6; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
          .amount { font-size: 36px; font-weight: bold; color: #3b82f6; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .status-badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🎉 Payout Initiated!</h1>
        </div>
        <div class="content">
          <h2>Hello ${this.escapeHtml(data.affiliateName)}!</h2>
          <p>Good news! A payout has been initiated for your earned commissions.</p>
          
          <div class="amount-box">
            <div style="font-size: 14px; color: #666; margin-bottom: 10px;">Payout Amount</div>
            <div class="amount">${amount}</div>
            <div style="margin-top: 15px;">
              <span class="status-badge">PENDING</span>
            </div>
          </div>
          
          <div class="details">
            <h3 style="margin-top: 0;">Payout Details</h3>
            <p><strong>Commissions Included:</strong> ${data.commissionCount} commission${data.commissionCount > 1 ? 's' : ''}</p>
            ${data.method ? `<p><strong>Payment Method:</strong> ${this.escapeHtml(data.method)}</p>` : ''}
            <p><strong>Payout ID:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${this.escapeHtml(data.payoutId)}</code></p>
          </div>
          
          <p>Your payout is currently being processed. You'll receive another email once the payment has been completed.</p>
          
          <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>⏱️ Processing Time:</strong><br>
            Payouts typically take 3-5 business days to process, depending on the payment method.
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/affiliate" class="button">View Payout Status</a>
          </div>
          
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            Thank you for being a valued partner! Continue referring customers to earn more.
          </p>
          
          <p>Best regards,<br>The Refferq Team</p>
        </div>
      </body>
      </html>
      `,
    });
  }

  private async partnerAllows(email: string, flag: 'notifySaleEarned' | 'notifyPayouts' | 'notifyTierUpgraded'): Promise<boolean> {
    try {
      const { prisma } = await import('./prisma');
      const affiliate = await prisma.affiliate.findFirst({
        where: { user: { email: email.toLowerCase() } },
        select: { notifySaleEarned: true, notifyPayouts: true, notifyTierUpgraded: true },
      });
      if (!affiliate) return true;
      return affiliate[flag] !== false;
    } catch (error) {
      console.error('Failed to load partner notification preference:', error);
      return true;
    }
  }

  async sendPayoutCompletedEmail(
    affiliateEmail: string,
    data: {
      affiliateName: string;
      amountCents: number;
      commissionCount: number;
      payoutId: string;
      method?: string;
      processedAt: string;
    }
  ): Promise<{ success: boolean; message: string }> {
    if (!(await this.partnerAllows(affiliateEmail, 'notifyPayouts'))) {
      return { success: true, message: 'Payout email skipped (partner opted out)' };
    }

    const symbol = await this.getCurrencySymbol();
    const brand = await getProgramBrand();
    const formatted = this.formatAmount(data.amountCents, symbol);
    return this.sendTemplatedEmail({
      to: affiliateEmail,
      templateType: 'PAYOUT',
      fallbackSubject: 'Your payout is on the way',
      variables: {
        name: data.affiliateName,
        email: affiliateEmail,
        amount: formatted,
        referralCode: '',
      },
      generateFallbackHtml: () =>
        wrapLaziEmail({
          preheader: 'We sent your commission payout.',
          kicker: 'Payout',
          heading: 'Your payout is on the way',
          intro: `Hi ${this.escapeHtml(data.affiliateName)},`,
          paragraphs: ['We sent your commission payout.'],
          details: [{ label: 'Amount', value: this.escapeHtml(formatted) }],
          ctaLabel: 'View dashboard',
          ctaUrl: brand.dashboardUrl,
          wordmark: EMAIL_WORDMARK,
        }),
    });
  }

  async sendSaleEarnedEmail(data: {
    affiliateEmail: string;
    affiliateName: string;
    amountCents: number;
    commissionCents: number;
    commissionRate: number;
    referralCode?: string;
    leadId?: string;
  }): Promise<{ success: boolean; message: string }> {
    if (!(await this.partnerAllows(data.affiliateEmail, 'notifySaleEarned'))) {
      return { success: true, message: 'Sale email skipped (partner opted out)' };
    }

    const symbol = await this.getCurrencySymbol();
    const brand = await getProgramBrand();
    const { commissionPercent } = await import('./commission-rate');
    const amount = this.formatAmount(data.amountCents, symbol);
    const commission = this.formatAmount(data.commissionCents, symbol);
    const commissionRate = `${commissionPercent(data.commissionRate)}%`;
    const leadId = data.leadId || '';
    return this.sendTemplatedEmail({
      to: data.affiliateEmail,
      templateType: 'SALE_EARNED',
      fallbackSubject: leadId ? `You earned a sale (${leadId})` : 'You earned a sale',
      variables: {
        name: data.affiliateName,
        email: data.affiliateEmail,
        amount,
        commission,
        commissionRate,
        referralCode: data.referralCode || '',
        leadId,
        reference: leadId,
      },
      generateFallbackHtml: () =>
        wrapLaziEmail({
          preheader: 'A referred sale just came through.',
          kicker: 'Sale',
          heading: 'You earned a sale',
          intro: `Hi ${this.escapeHtml(data.affiliateName)},`,
          paragraphs: ['A sale you referred was confirmed.'],
          details: [
            { label: 'Reference', value: this.escapeHtml(leadId || '—') },
            { label: 'Sale', value: this.escapeHtml(amount) },
            { label: 'Your commission', value: this.escapeHtml(commission) },
          ],
          ctaLabel: 'View dashboard',
          ctaUrl: brand.dashboardUrl,
          wordmark: EMAIL_WORDMARK,
        }),
    });
  }

  async sendTierUpgradedEmail(data: {
    affiliateEmail: string;
    affiliateName: string;
    tierName: string;
    previousTier?: string | null;
    commissionRate: number;
    referralCode?: string;
  }): Promise<{ success: boolean; message: string }> {
    if (!(await this.partnerAllows(data.affiliateEmail, 'notifyTierUpgraded'))) {
      return { success: true, message: 'Tier email skipped (partner opted out)' };
    }

    const brand = await getProgramBrand();
    const { commissionPercent } = await import('./commission-rate');
    const rateLabel = `${commissionPercent(data.commissionRate)}%`;
    return this.sendTemplatedEmail({
      to: data.affiliateEmail,
      templateType: 'TIER_UPGRADED',
      fallbackSubject: `You've been upgraded to ${data.tierName}`,
      variables: {
        name: data.affiliateName,
        email: data.affiliateEmail,
        tierName: data.tierName,
        previousTier: data.previousTier || '',
        commissionRate: rateLabel,
        referralCode: data.referralCode || '',
      },
      generateFallbackHtml: () =>
        wrapLaziEmail({
          preheader: 'You moved up a partner tier.',
          kicker: 'Tier',
          heading: "You've been upgraded",
          intro: `Hi ${this.escapeHtml(data.affiliateName)},`,
          paragraphs: [
            'You have been moved to a higher partner tier. New sales use your updated commission rate.',
          ],
          details: [
            { label: 'New tier', value: this.escapeHtml(data.tierName) },
            { label: 'Commission', value: this.escapeHtml(rateLabel) },
          ],
          ctaLabel: 'View dashboard',
          ctaUrl: brand.dashboardUrl,
          wordmark: EMAIL_WORDMARK,
        }),
    });
  }

  async sendCustomEmail(to: string, subject: string, html: string): Promise<{ success: boolean; message: string }> {
    return sendTransactionalEmail({ to, subject, html });
  }

  // ─── Generic Email (for system notifications) ────────────────
  async sendGenericEmail(to: string, data: { subject: string; body: string }) {
    const html = `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
          <h1 style="color: #ffffff; font-size: 22px; margin: 0;">LAZI STUDIO PARTNERS</h1>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">${this.escapeHtml(data.body)}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">This is an automated notification from LAZI STUDIO PARTNERS.</p>
        </div>
      </div>
    `;
    return this.sendEmail({ to, subject: data.subject, html });
  }
}

export const emailService = new EmailService();