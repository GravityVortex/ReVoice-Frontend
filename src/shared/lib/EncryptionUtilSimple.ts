// lib/encryption-simple.ts - 简化修复版本
import crypto from 'crypto';

const SECRET = 'secret_zhesheng_!@#$%Bsjaldffads';

class EncryptionUtilSimple {

    static generateRandomKey(length: number): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    static generateMD5(data: string): string {
        return crypto.createHash('md5').update(data).digest('hex');
    }

    /**
     * 创建固定32字节密钥
     */
    static createKey(secret: string, randomKey: string): Buffer {
        const combined = secret + randomKey;
        // 使用SHA256创建固定32字节密钥
        return crypto.createHash('sha256').update(combined).digest();
    }

    /**
     * 简化的加密方法
     */
    static encrypt(text: string, key: Buffer): string {
        try {

            // 确保密钥是Buffer且长度为32字节
            // let keyBuffer;
            // if (Buffer.isBuffer(key)) {
            //     keyBuffer = key;
            // } else {
            //     keyBuffer = Buffer.from(key, 'utf8');
            // }
            //
            // // 如果密钥不是32字节，使用SHA256哈希
            // if (keyBuffer.length !== 32) {
            //     keyBuffer = crypto.createHash('sha256').update(keyBuffer).digest();
            // }
            //
            // const cipher = crypto.createCipheriv('aes-256-ecb', keyBuffer, null);
            // let encrypted = cipher.update(text, 'utf8', 'base64');
            // encrypted += cipher.final('base64');
            // return encrypted;

            const cipher = crypto.createCipheriv('aes-256-ecb', key, Buffer.alloc(0));
            let encrypted = cipher.update(text, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            return encrypted;
        } catch (error: any) {
            throw new Error('加密失败: ' + error.message);
        }
    }

    /**
     * 简化的解密方法
     */
    static decrypt(encryptedText: string, key: Buffer): string {
        try {
            const decipher = crypto.createDecipheriv('aes-256-ecb', key, Buffer.alloc(0));
            let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error: any) {
            throw new Error('解密失败: ' + error.message);
        }
    }

    static encryptRequest(data: any): string {
        try {
            data.time = Math.floor(Date.now() / 1000);
            const jsonData = JSON.stringify(data);
            const randomKey = this.generateRandomKey(8);

            // 创建固定长度的密钥
            const finalKey = this.createKey(SECRET, randomKey);

            const encryptedData = this.encrypt(jsonData, finalKey);
            const hash = this.generateMD5(jsonData);

            return randomKey + hash + encryptedData;
        } catch (error: any) {
            console.error('加密请求错误:', error);
            throw error;
        }
    }

    static decryptRequest(encryptedString: string): any {
        try {
            if (encryptedString.length < 40) {
                throw new Error('无效的加密字符串');
            }

            const randomKey = encryptedString.substring(0, 8);
            const receivedHash = encryptedString.substring(8, 40);
            const encryptedData = encryptedString.substring(40);

            const finalKey = this.createKey(SECRET, randomKey);
            const decryptedData = this.decrypt(encryptedData, finalKey);

            const calculatedHash = this.generateMD5(decryptedData);
            if (calculatedHash !== receivedHash) {
                throw new Error('数据被篡改');
            }

            const data = JSON.parse(decryptedData);

            if (!data.time) {
                throw new Error('缺少时间戳字段');
            }

            const requestTime = parseInt(data.time);
            const currentTime = Math.floor(Date.now() / 1000);

            if (Math.abs(currentTime - requestTime) > 300) {
                throw new Error('请求已过期');
            }

            return data;
        } catch (error: any) {
            console.error('解密请求错误:', error);
            throw error;
        }
    }
}

export default EncryptionUtilSimple;