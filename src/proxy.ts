import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getRequestSession } from '@/lib/request-user';

export async function proxy(request: NextRequest) {
    // Strip client identity hints before redirects, auth checks or pass-throughs.
    const requestHeaders = new Headers(request.headers);
    for (const name of Array.from(requestHeaders.keys())) {
        if (name.startsWith('x-user-')) requestHeaders.delete(name);
    }
    const host = (request.headers.get('host') || '').split(':')[0];
    if (host === 'referrals.lazi.studio') {
        const url = request.nextUrl.clone();
        url.hostname = 'partners.lazi.studio';
        url.protocol = 'https:';
        url.port = '';
        return NextResponse.redirect(url, 308);
    }

    const { pathname } = request.nextUrl;

    // 1. Define protected routes
    const isAdminRoute = pathname.startsWith('/api/admin') || pathname.startsWith('/admin');
    const isAffiliateRoute = pathname.startsWith('/api/affiliate') || pathname.startsWith('/affiliate');

    if (!isAdminRoute && !isAffiliateRoute) {
        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // 2. Get token from cookies
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
        // If it's an API route, return 401
        if (pathname.startsWith('/api/')) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }
        // If it's a page route, redirect to login
        return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
        // 3. Verify JWT
        const session = await getRequestSession(request);
        if (!session) throw new Error('Invalid session');
        const userRole = session.role;

        // 4. Role-based access control
        if (isAdminRoute && userRole !== 'ADMIN') {
            if (pathname.startsWith('/api/')) {
                return NextResponse.json(
                    { error: 'Forbidden: Admin access required' },
                    { status: 403 }
                );
            }
            return NextResponse.redirect(new URL('/login', request.url));
        }

        if (isAffiliateRoute && userRole !== 'AFFILIATE' && userRole !== 'ADMIN') {
            if (pathname.startsWith('/api/')) {
                return NextResponse.json(
                    { error: 'Forbidden: Affiliate access required' },
                    { status: 403 }
                );
            }
            return NextResponse.redirect(new URL('/login', request.url));
        }

        // Route handlers independently verify the cookie; no identity header is trusted.
        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    } catch (error) {
        if (pathname.startsWith('/api/')) {
            return NextResponse.json(
                { error: 'Invalid or expired token' },
                { status: 401 }
            );
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }
}

// See "Matching Paths" below to learn more
export const config = {
    matcher: [
        '/:path*',
    ],
};
