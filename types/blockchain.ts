export interface Block {
  index: number;
  timestamp: number;
  data: string;
  previous_hash: string;
  hash: string;
  nonce: number;
}

export interface BlockchainStats {
  total_blocks: number;
  total_transactions: number;
  pending_transactions: number;
  is_valid: boolean;
  last_block_time: number;
}
