import axios, { AxiosInstance } from 'axios';
import { logger } from '../../shared/logger/logger.js';
import { CONSTANTS } from '../../config/constants.js';
import { BrendiTokenResponse, validateBrendiToken } from './brendi.types.js';

interface TokenCache {
  accessToken: string;
  expiresAt: number; // timestamp em ms
}

export class OAuthService {
  private client: AxiosInstance;
  private tokenCache: TokenCache | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: CONSTANTS.BRENDI.TOKEN_URL.replace('/oauth/token', ''),
      timeout: CONSTANTS.HTTP.TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error({ err: error, url: error.config?.url }, 'OAuth request failed');
        return Promise.reject(error);
      }
    );
  }

  async getValidToken(): Promise<string> {
    if (this.tokenCache && this.isTokenValid()) {
      return this.tokenCache.accessToken;
    }

    return this.fetchNewToken();
  }

  private isTokenValid(): boolean {
    if (!this.tokenCache) return false;
    // Considerar válido se expira em mais de 1 minuto (buffer)
    return Date.now() < this.tokenCache.expiresAt - CONSTANTS.BRENDI.TOKEN_BUFFER_MS;
  }

  private async fetchNewToken(): Promise<string> {
    logger.info('Fetching new OAuth token from Brendi');

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CONSTANTS.BRENDI.CLIENT_ID,
      client_secret: CONSTANTS.BRENDI.CLIENT_SECRET,
    });

    try {
      const response = await this.client.post<BrendiTokenResponse>(
        '/oauth/token',
        params.toString()
      );

      const tokenData = validateBrendiToken(response.data);

      this.tokenCache = {
        accessToken: tokenData.access_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
      };

      logger.info({ expiresIn: tokenData.expires_in }, 'OAuth token obtained successfully');
      return this.tokenCache.accessToken;
    } catch (error) {
      logger.error({ err: error }, 'Failed to obtain OAuth token');
      throw error;
    }
  }

  clearCache(): void {
    this.tokenCache = null;
  }

  getTokenInfo(): { hasToken: boolean; expiresAt: number | null; isValid: boolean } {
    return {
      hasToken: !!this.tokenCache,
      expiresAt: this.tokenCache?.expiresAt ?? null,
      isValid: this.isTokenValid(),
    };
  }
}

export const oauthService = new OAuthService();