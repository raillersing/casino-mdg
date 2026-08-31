from .models import Notification


def create_notification(user, category: str, title: str, message: str) -> Notification:
    return Notification.objects.create(
        user=user,
        category=category,
        title=title,
        message=message,
    )
