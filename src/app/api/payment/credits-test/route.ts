import {consumeCredits, refundCredits} from '@/shared/models/credit';
import {getUserInfo} from '@/shared/models/user';
import {NextRequest, NextResponse} from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // get current user
    const user = await getUserInfo();
    if (!user) {
      throw new Error('no auth, please sign in');
    }

    const {action, credits, creditId} = await req.json();

    // 模拟消耗积分
    if (action === 'consume') {
      const result = await consumeCredits({
        userId: user?.id,
        credits: credits || 2,
        scene: 'convert_video',
        description: '模拟视频转换任务消耗积分',
        metadata: JSON.stringify({type: 'test'}),
      });
      return NextResponse.json({success: true, data: result});
    } 
    // 退还积分必传creditId
    else if (action === 'refund') {
      if (!creditId) {
        return NextResponse.json(
            {error: 'creditId is required for refund'}, {status: 400});
      }
      const result = await refundCredits({creditId});
      return NextResponse.json({success: true, data: result});
    } else {
      return NextResponse.json({error: 'Invalid action'}, {status: 400});
    }
  } catch (error: any) {
    console.error('Credits test error:', error);
    return NextResponse.json({error: error.message}, {status: 500});
  }
}
