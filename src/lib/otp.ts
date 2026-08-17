import { prisma } from './prisma';
import crypto from 'crypto';

export class OTPService {
  // Generate a cryptographically secure 6-digit OTP
  private generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  // Generate and send OTP via email
  async sendOTP(email: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!user) {
        return {
          success: false,
          message: 'No account found with this email address'
        };
      }

      // Check user status — invited partners can log in to accept
      if (user.status === 'PENDING') {
        return {
          success: false,
          message: 'Your account is pending approval. Please wait for admin activation.'
        };
      }
      if (user.status === 'INACTIVE' || user.status === 'SUSPENDED') {
        return {
          success: false,
          message: 'Your account is not active. Please contact support.'
        };
      }

      // Check for recent OTP attempts (rate limiting)
      const recentOTP = await (prisma as any).OTP.findFirst({
        where: {
          email: email.toLowerCase(),
          createdAt: {
            gte: new Date(Date.now() - 60000) // Within last minute
          }
        }
      });

      if (recentOTP) {
        return {
          success: false,
          message: 'Please wait 1 minute before requesting another OTP'
        };
      }

      // Invalidate any existing unused OTPs for this email
      await (prisma as any).OTP.updateMany({
        where: {
          email: email.toLowerCase(),
          isUsed: false
        },
        data: {
          isUsed: true
        }
      });

      // Generate new OTP
      const code = this.generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP in database
      await (prisma as any).OTP.create({
        data: {
          email: email.toLowerCase(),
          code,
          expiresAt
        }
      });

      const { emailService } = await import('./email');
      const emailResult = await emailService.sendOtpEmail(email, user.name || 'there', code);

      if (!emailResult.success) {
        console.error('Failed to send OTP email:', emailResult.message);
        return {
          success: false,
          message: 'Failed to send OTP email. Please try again.'
        };
      }

      return {
        success: true,
        message: 'OTP sent successfully to your email'
      };

    } catch (error) {
      console.error('Error sending OTP:', error);
      return {
        success: false,
        message: 'An error occurred while sending OTP'
      };
    }
  }

  // Verify OTP and return user if valid
  async verifyOTP(email: string, code: string): Promise<{
    success: boolean;
    user?: any;
    message: string;
  }> {
    try {
      // Find the OTP
      const otp = await (prisma as any).OTP.findFirst({
        where: {
          email: email.toLowerCase(),
          code,
          isUsed: false,
          expiresAt: {
            gt: new Date()
          }
        }
      });

      if (!otp) {
        // Increment attempts for any existing OTP
        await (prisma as any).OTP.updateMany({
          where: {
            email: email.toLowerCase(),
            code,
            isUsed: false
          },
          data: {
            attempts: {
              increment: 1
            }
          }
        });

        return {
          success: false,
          message: 'Invalid or expired OTP'
        };
      }

      // Check attempts limit
      if (otp.attempts >= 3) {
        await (prisma as any).OTP.update({
          where: { id: otp.id },
          data: { isUsed: true }
        });

        return {
          success: false,
          message: 'Too many invalid attempts. Please request a new OTP.'
        };
      }

      // Mark OTP as used
      await (prisma as any).OTP.update({
        where: { id: otp.id },
        data: { isUsed: true }
      });

      // Get user details
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: {
          affiliate: true
        }
      });

      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      return {
        success: true,
        user,
        message: 'OTP verified successfully'
      };

    } catch (error) {
      console.error('Error verifying OTP:', error);
      return {
        success: false,
        message: 'An error occurred while verifying OTP'
      };
    }
  }

  // Clean up expired OTPs (should be run periodically)
  async cleanupExpiredOTPs(): Promise<void> {
    try {
      await (prisma as any).OTP.deleteMany({
        where: {
          OR: [
            {
              expiresAt: {
                lt: new Date()
              }
            },
            {
              isUsed: true,
              createdAt: {
                lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours old
              }
            }
          ]
        }
      });
    } catch (error) {
      console.error('Error cleaning up expired OTPs:', error);
    }
  }
}

export const otpService = new OTPService();