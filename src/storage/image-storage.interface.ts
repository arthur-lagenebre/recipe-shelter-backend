export type PutImageInput = {
    key: string;
    body: Buffer;
    contentType: string;
};

export interface ImageStorage {
    put(input: PutImageInput): Promise<void>;
    delete(key: string): Promise<void>;
    exists?(key: string): Promise<boolean>;
    getPublicUrl(key: string): string;
}
